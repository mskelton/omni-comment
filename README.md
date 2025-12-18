# GitHub Omni Comment Action

Combine outputs from many jobs into a single comment

## Usage

Create a file named `.github/omni-comment.yml` to define the section IDs that _can_ appear in the
comment.

```yaml
sections:
  - test_results
  - deploy_preview
  - perf_stats
```

Now, in your GitHub action workflow, you can run the action with the comment `section` and `message`
which will be posted.

```yaml
- name: Comment with test results
  uses: mskelton/omni-comment@v1
  with:
    section: test_results
    message: Hello world
```

### Comment from a file

To comment from a file on disk, you can use the `file-path` input instead of `message`.

_If both a `message` and `file-path` are provided, `message` will take precedence._

```yaml
- name: Comment with test results
  uses: mskelton/omni-comment@v1
  with:
    section: test_results
    file-path: /path/to/file.txt
```

### Specifying the pull request

If you are running this action from a workflow without the `pull_request` context (e.g.
`workflow_run`), you can use the `pr-number` input to specify which pull request to comment on.

```yaml
- name: Comment with test results
  uses: mskelton/omni-comment@v1
  with:
    section: test_results
    message: Hello world
    pr-number: 123
```

### Inputs

#### Action Inputs

| Name        | Description                                                      | Required | Default                     |
| ----------- | ---------------------------------------------------------------- | -------- | --------------------------- |
| `section`   | The section ID that matches with the value in `omni-comment.yml` | ✅       |                             |
| `message`   | Comment body                                                     |          |                             |
| `file-path` | File path containing the comment body                            |          |                             |
| `title`     | An optional title for the comment section                        |          |                             |
| `collapsed` | Whether to collapse the comment section by default               |          | `false`                     |
| `pr-number` | The pull request number where to create the comment              |          | current pull request number |
| `token`     | GitHub auth token                                                |          | `${{ github.token }}`       |
| `config`    | Path to the config file                                          |          | `.github/omni-comment.yml`  |

#### Metadata (`omni-comment.yml`)

| Name       | Description                                                                | Required |
| ---------- | -------------------------------------------------------------------------- | -------- |
| `sections` | A list of section IDs that defines the order of comment sections           | ✅       |
| `title`    | An optional title for the comment                                          |          |
| `intro`    | An optional introduction for the comment that is displayed under the title |          |

### Outputs

| Name       | Description                                    |
| ---------- | ---------------------------------------------- |
| `id`       | Comment ID that was created or updated         |
| `html_url` | URL of the comment that was created or updated |

### Permissions

Depending on the permissions granted to your token, you may lack some rights. To run successfully,
this actions needs at least:

```yaml
permissions:
  pull-requests: write
```

## How does it work?

I built this action to solve a problem we have at [Ramp](https://ramp.com/) of lots of CI outputs
that each need to post back to the PR via comments. The problem is, the more comments you have, the
more noisy it gets.

The idea was, what if you had a single comment that contained everything? Test results, deploy
preview URLs, warnings, etc. When you try to build that though, there are some challenges.

First, it should support workflows running in parallel, so the order in which the comments are
posted is non deterministic. However, we want the order of sections in the comment to be consistent
between runs. Additionally, we need to support updating the comment if you push a new commit, and
the test results are now passing instead of failed.

The GitHub issue comments API only supports sending a complete comment body when making updates, so
if we just get the current value and send it back with our updates, its possible that two separate
jobs update the comment at the same time and one of the updates will be lost. To workaround this, we
need a way for jobs to acquire a "lock" on the issue, so that they can safely get the current
comment value, make edits, and push the updated value back to GitHub.

What better locking mechanism than reactions! Turns out, the
[create reaction](https://docs.github.com/en/rest/reactions/reactions?apiVersion=2022-11-28#create-reaction-for-an-issue)
API will return a `201 Created` status when a reaction is newly created and a `200 OK` when the
reaction already exists. Using this subtle API detail, this action will attempt to acquire a lock by
creating the reaction and waiting for a `201` status code. If it receives a `200` status code, it
will sleep and retry until it is able to acquire a lock (it will fail after 30 seconds if it fails
to acquire a lock). Once the lock is acquired, the existing comment will be downloaded, edited, and
pushed back to GitHub. After updating the comment, the lock is released by deleting the reaction.

Simple right? 😉
