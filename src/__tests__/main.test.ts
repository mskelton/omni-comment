import * as core from "@actions/core"
import yaml from "js-yaml"
import { fs, vol } from "memfs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createBlankComment } from "../comments"
import { run } from "../multiComment"

vi.mock("node:fs", () => ({ default: fs }))
vi.mock("node:fs/promises", () => ({ default: fs.promises }))

vi.mock("@actions/core")
vi.mock("@actions/github", () => ({
  context: {
    payload: {
      owner: "test-owner",
      pull_request: {
        number: 123,
      },
      repo: "test-repo",
    },
  },
}))

const respond = (data: any, status: number) => ({ data, headers: {}, status, url: "" })
const created = (data: any) => respond(data, 201)
const ok = (data: any) => respond(data, 200)

describe("multi comment", async () => {
  const github = await vi.importActual<typeof github>("@actions/github")
  const octokit = github.getOctokit("faketoken")

  beforeEach(async () => {
    vi.clearAllMocks()
    vol.reset()

    // Throw a sample config file since most tests don't need to do this separately
    fs.writeFileSync("/multi-comment.yml", yaml.dump({ sections: ["test-section"] }))

    // Mock the endpoint so that the `paginate` method can be called
    vi.spyOn(octokit.rest.issues.listComments, "endpoint").mockReturnValue({
      body: null,
      headers: {},
      method: "GET",
      url: "",
    })

    // Mock that all reactions are created. We can override this for testing the locking logic, but
    // for most tests, let's just assume there isn't currently a lock in place.
    vi.spyOn(octokit.rest.reactions, "createForIssue").mockResolvedValue(created({ id: 1 }))
    vi.spyOn(octokit.rest.reactions, "createForIssueComment").mockResolvedValue(created({ id: 2 }))

    // Deleting the reactions is something we'll never need to care about mocking separately
    vi.spyOn(octokit.rest.reactions, "deleteForIssue").mockResolvedValue(ok({}))
    vi.spyOn(octokit.rest.reactions, "deleteForIssueComment").mockResolvedValue(ok({}))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should fail if no message or file path provided", async () => {
    vi.mocked(core.getInput).mockReturnValue("")

    await run(octokit)
    expect(core.setFailed).toHaveBeenCalledWith('Either "file-path" or "message" is required.')
  })

  it("should fail if no issue number found", async () => {
    vi.mocked(core.getInput).mockImplementation((key) => {
      if (key === "message") return "test message"
      return ""
    })

    vi.mock("@actions/github", () => ({
      context: {
        payload: {
          owner: "test-owner",
          repo: "test-repo",
        },
      },
    }))

    await run(octokit)
    expect(core.setFailed).toHaveBeenCalledWith(
      "No issue/pull request in input neither in current context.",
    )
  })

  it("should create new comment when none exists", async () => {
    vi.mocked(core.getInput).mockImplementation((key) => {
      if (key === "config") return "/multi-comment.yml"
      if (key === "message") return "test message"
      if (key === "section") return "test-section"
      if (key === "pr-number") return "123"
      return ""
    })

    vi.spyOn(octokit.paginate, "iterator").mockImplementation(async function* () {
      yield created([])
    })

    const createCommentSpy = vi
      .spyOn(octokit.rest.issues, "createComment")
      .mockResolvedValue(created({ html_url: "test-url", id: 456 }))

    await run(octokit)

    expect(core.setFailed).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith("id", 456)
    expect(core.setOutput).toHaveBeenCalledWith("html-url", "test-url")

    const request = createCommentSpy.mock.calls[0][0] as any
    expect(request.issue_number).toBe(123)
    expect(request.body).toMatchInlineSnapshot(`
      "<!-- mskelton/multi-comment id="main" -->

      <!-- mskelton/multi-comment start="test-section" -->
      test message
      <!-- mskelton/multi-comment end="test-section" -->"
    `)
  })

  it("should lock the PR for the first comment", async () => {
    vi.mocked(core.getInput).mockImplementation((key) => {
      if (key === "config") return "/multi-comment.yml"
      if (key === "message") return "test message"
      if (key === "section") return "test-section"
      if (key === "pr-number") return "123"
      return ""
    })

    vi.spyOn(octokit.rest.reactions, "createForIssue")
      .mockResolvedValueOnce(ok({ id: 1 }))
      .mockResolvedValueOnce(created({ id: 1 }))

    vi.spyOn(octokit.paginate, "iterator").mockImplementation(async function* () {
      yield created([])
    })

    const createCommentSpy = vi
      .spyOn(octokit.rest.issues, "createComment")
      .mockResolvedValue(created({ html_url: "test-url", id: 456 }))

    await run(octokit)

    expect(core.setFailed).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith("id", 456)
    expect(core.setOutput).toHaveBeenCalledWith("html-url", "test-url")

    const request = createCommentSpy.mock.calls[0][0] as any
    expect(request.issue_number).toBe(123)
    expect(request.body).toMatchInlineSnapshot(`
      "<!-- mskelton/multi-comment id="main" -->

      <!-- mskelton/multi-comment start="test-section" -->
      test message
      <!-- mskelton/multi-comment end="test-section" -->"
    `)
  })

  it("should update existing comment", async () => {
    vi.mocked(core.getInput).mockImplementation((key) => {
      if (key === "config") return "/multi-comment.yml"
      if (key === "message") return "updated message"
      if (key === "section") return "test-section"
      if (key === "pr-number") return "123"
      return ""
    })

    vi.spyOn(octokit.paginate, "iterator").mockImplementation(async function* () {
      yield ok([{ body: await createBlankComment(), id: 456 }])
    })

    vi.spyOn(octokit.rest.issues, "getComment").mockResolvedValue(
      ok({
        body: await createBlankComment(),
        html_url: "test-url",
        id: 456,
      }),
    )

    const updateCommentSpy = vi
      .spyOn(octokit.rest.issues, "updateComment")
      .mockResolvedValue(created({ html_url: "test-url", id: 456 }))

    await run(octokit)

    expect(core.setFailed).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith("id", 456)
    expect(core.setOutput).toHaveBeenCalledWith("html-url", "test-url")

    const request = updateCommentSpy.mock.calls[0][0] as any
    expect(request.comment_id).toBe(456)
    expect(request.body).toMatchInlineSnapshot(`
      "<!-- mskelton/multi-comment id="main" -->

      <!-- mskelton/multi-comment start="test-section" -->
      updated message
      <!-- mskelton/multi-comment end="test-section" -->"
    `)
  })

  it("should lock the comment when updating", async () => {
    vi.mocked(core.getInput).mockImplementation((key) => {
      if (key === "config") return "/multi-comment.yml"
      if (key === "message") return "updated message"
      if (key === "section") return "test-section"
      if (key === "pr-number") return "123"
      return ""
    })

    vi.spyOn(octokit.rest.reactions, "createForIssueComment")
      .mockResolvedValueOnce(ok({ id: 1 }))
      .mockResolvedValueOnce(created({ id: 1 }))

    vi.spyOn(octokit.paginate, "iterator").mockImplementation(async function* () {
      yield ok([{ body: await createBlankComment(), id: 456 }])
    })

    vi.spyOn(octokit.rest.issues, "getComment").mockResolvedValue(
      ok({
        body: await createBlankComment(),
        html_url: "test-url",
        id: 456,
      }),
    )

    const updateCommentSpy = vi
      .spyOn(octokit.rest.issues, "updateComment")
      .mockResolvedValue(created({ html_url: "test-url", id: 456 }))

    await run(octokit)

    expect(core.setFailed).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith("id", 456)
    expect(core.setOutput).toHaveBeenCalledWith("html-url", "test-url")

    const request = updateCommentSpy.mock.calls[0][0] as any
    expect(request.comment_id).toBe(456)
    expect(request.body).toMatchInlineSnapshot(`
      "<!-- mskelton/multi-comment id="main" -->

      <!-- mskelton/multi-comment start="test-section" -->
      updated message
      <!-- mskelton/multi-comment end="test-section" -->"
    `)
  })
})
