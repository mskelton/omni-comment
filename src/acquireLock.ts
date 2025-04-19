import * as core from "@actions/core"
import * as github from "@actions/github"
import { retry } from "./retry"

export async function acquireLock(type: "comment" | "issue", id: number) {
  const octokit = github.getOctokit(core.getInput("token"))

  return retry(
    async ({ attempt, maxAttempts }) => {
      core.debug(`Attempting to acquire lock (attempt ${attempt + 1}/${maxAttempts})...`)

      const args = {
        ...github.context.repo,
        content: "eyes" as const,
      }

      const { data: reaction, status } =
        type === "issue"
          ? await octokit.rest.reactions.createForIssue({ ...args, issue_number: id })
          : await octokit.rest.reactions.createForIssueComment({ ...args, comment_id: id })

      if (status === 201) {
        core.debug("Lock acquired")

        return async () => {
          const args = {
            ...github.context.repo,
            reaction_id: reaction.id,
          }

          if (type === "issue") {
            await octokit.rest.reactions.deleteForIssue({ ...args, issue_number: id })
          } else {
            await octokit.rest.reactions.deleteForIssueComment({ ...args, comment_id: id })
          }
        }
      } else {
        throw new Error("Lock not acquired")
      }
    },
    10,
    1000,
  )
}
