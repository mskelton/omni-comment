import * as core from "@actions/core"
import * as github from "@actions/github"
import { GitHub } from "@actions/github/lib/utils"
import fs from "node:fs/promises"
import { acquireLock } from "./acquireLock"
import { createComment, findComment, updateComment } from "./comments"

export async function run(octokit: InstanceType<typeof GitHub>) {
  try {
    const title = core.getInput("title")
    const collapsed = core.getBooleanInput("collapsed")
    const section = core.getInput("section")
    const message = core.getInput("message")
    const filePath = core.getInput("file-path")

    const issueNumber =
      parseInt(core.getInput("pr-number")) ||
      github.context.payload.pull_request?.number ||
      github.context.payload.issue?.number

    if (!issueNumber) {
      throw new Error("No issue/pull request in input neither in current context.")
    }

    const content = filePath ? await fs.readFile(filePath, "utf8") : message
    let comment = await findComment(issueNumber, octokit)

    if (comment) {
      const commentId = comment.id
      await using _ = await acquireLock("comment", commentId, octokit)
      comment = await updateComment(commentId, title, section, content, collapsed, octokit)
    } else if (content) {
      await using _ = await acquireLock("issue", issueNumber, octokit)
      comment = await createComment(issueNumber, title, section, content, collapsed, octokit)
    }

    if (comment) {
      core.setOutput("id", comment.id)
      core.setOutput("html-url", comment.html_url)
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}
