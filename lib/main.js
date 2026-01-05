import * as core from "@actions/core"
import * as github from "@actions/github"
import { readFile } from "node:fs/promises"
import { omniComment } from "@omni-comment/core"

function createLogger() {
  return {
    debug: core.debug,
    error: core.error,
    info: core.info,
    warn: core.warning,
  }
}

async function main() {
  let message = core.getInput("message")
  const title = core.getInput("title")
  const collapsed = core.getBooleanInput("collapsed")
  const section = core.getInput("section")
  const filePath = core.getInput("file-path")
  const config = core.getInput("config")

  if (!message && filePath) {
    message = await readFile(filePath, "utf8")
  }

  const issueNumber =
    parseInt(core.getInput("pr-number")) ||
    github.context.payload.pull_request?.number ||
    github.context.payload.issue?.number

  if (!issueNumber) {
    throw new Error("No issue/pull request in input neither in current context.")
  }

  const result = await omniComment({
    collapsed,
    issueNumber,
    logger: createLogger(),
    message,
    repo: `${github.context.repo.owner}/${github.context.repo.repo}`,
    section,
    title,
    token: core.getInput("token"),
    configPath: config,
  })

  if (result) {
    core.setOutput("id", result.id)
    core.setOutput("html-url", result.html_url)
  }
}

main()
