import * as core from "@actions/core"
import * as github from "@actions/github"
import { GitHub } from "@actions/github/lib/utils"
import { retry } from "./retry"

export function acquireLock(
  type: "comment" | "issue",
  id: number,
  octokit: InstanceType<typeof GitHub>,
): Promise<AsyncDisposable> {
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

      const unlock = async () => {
        core.debug("Releasing lock...")

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

      if (status === 201) {
        core.debug("Lock acquired")
      } else {
        // If the lock has not been acquired after 9 attempts, it's probably due
        // to some error in another job that prevented the lock from being
        // released. To prevent a dead-lock that the user is unable to easily
        // recover from, let's automatically release the lock in this case.
        //
        // Is this dangerous? Technical yes, but if for some reason the comment
        // gets updated slightly incorrectly, it's better than a dead-lock.
        if (attempt + 1 === maxAttempts) {
          await unlock()
        }

        throw new Error("Lock not acquired")
      }

      return {
        async [Symbol.asyncDispose]() {
          await unlock()
        },
      }
    },
    10,
    1000,
  )
}
