import * as core from "@actions/core"
import * as github from "@actions/github"
import { run } from "./omniComment"

const token = core.getInput("token")
const client = github.getOctokit(token)

run(client)
