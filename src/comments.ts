import * as core from "@actions/core"
import * as github from "@actions/github"
import { Metadata, readMetadata } from "./metadata"

export async function findComment(prNumber: number) {
  core.debug("Searching for existing comment...")

  const octokit = github.getOctokit(core.getInput("token"))
  const commentTagPattern = createIdentifier("id", "main")

  for await (const { data: comments } of octokit.paginate.iterator(
    octokit.rest.issues.listComments,
    { ...github.context.repo, issue_number: prNumber },
  )) {
    const comment = comments.find(({ body }) => body?.includes(commentTagPattern))

    if (comment) {
      return comment
    }
  }
}

export async function createComment(issueNumber: number, section: string, content: string) {
  core.debug("Creating comment...")

  const octokit = github.getOctokit(core.getInput("token"))
  const metadata = await readMetadata()

  const { data: comment } = await octokit.rest.issues.createComment({
    ...github.context.repo,
    body: editCommentBody({
      body: createBlankComment(metadata),
      content,
      section,
    }),
    issue_number: issueNumber,
  })

  return comment
}

export async function updateComment(commentId: number, section: string, content: string) {
  core.debug("Updating comment...")

  const octokit = github.getOctokit(core.getInput("token"))

  const { data: comment } = await octokit.rest.issues.getComment({
    ...github.context.repo,
    comment_id: commentId,
  })

  if (!comment?.body) {
    throw new Error("Comment body is empty")
  }

  await octokit.rest.issues.updateComment({
    ...github.context.repo,
    body: editCommentBody({
      body: comment.body,
      content,
      section,
    }),
    comment_id: commentId,
  })

  return comment
}

function createIdentifier(key: string, value: string) {
  return `<!-- mskelton/multi-comment ${key}="${value}" -->`
}

function createBlankComment(metadata: Metadata) {
  const { intro, sections, title } = metadata

  return [
    createIdentifier("id", "main"),
    title ? `# ${title}` : undefined,
    intro,
    ...sections.flatMap((section) => [
      createIdentifier("start", section),
      createIdentifier("end", section),
    ]),
  ]
    .filter(Boolean)
    .join("\n\n")
}

function editCommentBody({
  body,
  content,
  section,
}: {
  body: string
  content: string
  section: string
}) {
  const lines = body.split("\n")
  const startIndex = lines.findIndex((line) => line.includes(createIdentifier("start", section)))
  const endIndex = lines.findIndex((line) => line.includes(createIdentifier("end", section)))

  if (startIndex === -1 || endIndex === -1) {
    throw new Error("Section not found")
  }

  return [...lines.slice(0, startIndex + 1), content, ...lines.slice(endIndex)].join("\n")
}
