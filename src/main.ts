import * as core from "@actions/core"
import * as github from "@actions/github"
import fs from "node:fs/promises"
import { acquireLock } from "./acquireLock"
import { createComment, findComment, updateComment } from "./comments"

run()

async function run() {
  try {
    const section = core.getInput("section")
    const message = core.getInput("message")
    const filePath = core.getInput("file-path")

    if (!message && !filePath) {
      throw new Error('Either "file-path" or "message" is required.')
    }

    const issueNumber =
      parseInt(core.getInput("pr-number")) ||
      github.context.payload.pull_request?.number ||
      github.context.payload.issue?.number

    if (!issueNumber) {
      throw new Error("No issue/pull request in input neither in current context.")
    }

    const content = message || (await fs.readFile(filePath, "utf8"))
    let comment = await findComment(issueNumber)

    if (comment) {
      const commentId = comment.id
      await using _ = await acquireLock("comment", commentId)
      comment = await updateComment(commentId, section, content)
    } else {
      await using _ = await acquireLock("issue", issueNumber)
      comment = await createComment(issueNumber, section, content)
    }

    core.setOutput("id", comment.id)
    core.setOutput("html-url", comment.html_url)
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}
