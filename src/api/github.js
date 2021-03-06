const github = require('@actions/github')
const { Octokit } = require("@octokit/rest")
const bugcatcher = require('./bugcatcher')
const { appUrl } = require('../../config')
const {
  passesSeverity,
  statusSetupPending,
  statusUploadingPending,
  statusUploadingFailure,
  statusTestingPending,
  statusTestingFailure,
  statusResultsPending,
  statusResultsFailure,
  statusResultsSuccess,
  resultsUri,
} = require('../util')

async function createHook(request) {
  try {
    const { body, user } = request
    const { owner, repo } = body
    const { github_token: githubToken } = user
    const url = `${appUrl}webhook/github`

    const octokit = new Octokit({
      auth: githubToken
    })

    // find the repo
    const { data: fetchedRepo } = await octokit.repos.get({
      owner,
      repo,
    })
    if (!fetchedRepo) return

    // get the tree sha for the default branch
    const { data: fetchedBranch } = await octokit.repos.getBranch({
      owner,
      repo,
      branch: fetchedRepo['default_branch'],
    })
    if (!fetchedBranch) return

    let payload = {
      owner,
      repo,
    }
    const { data } = await octokit.repos.listHooks(payload).catch((c) => {
      console.error(c)
      return({})}
    )
    if (data) {
      const matchingWebhook = data.find(h => h.config.url === url)
      if (matchingWebhook) {
        await octokit.repos.deleteHook({
          ...payload,
          hook_id: matchingWebhook['id']
        })
      }
    }
    payload = {
      ...payload,
      events: ["push", "pull_request"],
      config: {
        url,
        content_type: 'json',
      }
    }
    const webhook = await octokit.repos.createHook(payload).catch(() => null)
    if (webhook && webhook.data) webhook.data['repoTreeSha'] = fetchedBranch['commit']['commit']['tree']['sha']
    return webhook
  }
  catch(err) {
    console.error(err)
    return (err)
  }
}

async function deleteHook(request) {
  try {
    const { body, user } = request
    const { owner, repo } = body
    const { github_token: githubToken } = user
    const url = `${appUrl}webhook/github`

    const octokit = new Octokit({
      auth: githubToken
    })

    // find the repo
    const { data: fetchedRepo } = await octokit.repos.get({
      owner,
      repo,
    })
    if (!fetchedRepo) return

    let payload = {
      owner,
      repo,
    }
    const { data } = await octokit.repos.listHooks(payload).catch(() => ({}))
    if (data) {
      const matchingWebhook = data.find(h => h.config.url === url)
      if (matchingWebhook) {
        return octokit.repos.deleteHook({
          ...payload,
          hook_id: matchingWebhook['id']
        })
      }
    }
    return
  }
  catch(err) {
    console.error(err)
    return (err)
  }
}

async function testRepo (request) {
  try {
    const { body, headers, user } = request
    const { "x-github-event": githubEvent } = headers
    const { compare } = body
    const { environment, github_token: githubToken, sid } = user

    // Only process `push` events with a `compare` value
    if (
      !user ||
      !sid ||
      !githubToken ||
      !compare ||
      !githubEvent ||
      githubEvent !== 'push'
    ) return
    else {
      const { head_commit: headCommit = {} } = body
      const { tree_id: treeId } = headCommit

      if (!treeId) return
      
      let context = github.context
      context.environment = environment
      context.token = sid
      context.severityThreshold = 'medium'
      context.github = new github.GitHub(githubToken)
      context.payload = body
  
      const { data: getTree = {} } = await bugcatcher.getTree(context)
      const { tree } = getTree
      if (!tree) return new Error('Failed to retrieve repo tree.')
      context.tree = tree
      
      /** Upload repo from tree sha */
      statusSetupPending(context)
      statusUploadingPending(context)
      const uploaded = await bugcatcher.uploadFromTree(context, tree)
        .catch(() => null)
      if (!uploaded) {
        statusUploadingFailure(context)
        throw new Error('Failed to synchronize repo contents.')
      }
      
      /** Initiate a test */
      statusTestingPending(context)
      const testId = await bugcatcher.runTests(context)
        .catch(() => null)
      if (!testId) {
        statusTestingFailure(context)
        throw new Error('Failed to initialize tests.')
      }
      context.testId = testId
      context.test = await bugcatcher.initCheckTestStatus(context)
      if (!context.test) {
        statusTestingFailure(context)
        throw new Error('Failed to complete tests.')
      }

      /** Fetch the results */
      statusResultsPending(context)
      const fetchResults = await bugcatcher.fetchResults(context)
        .catch(() => null)
      const { results } = fetchResults
      if (results && results.test_run_result) {
        context.results = results
        let resultsMatrix = {
          low: 0,
          medium: 0,
          high: 0,
        }

        let failed
        results.test_run_result.forEach(hit => {
          const test_suite_test = hit['test_suite_test']
          const ftl_severity = test_suite_test['ftl_severity']
          resultsMatrix[ftl_severity]++
          if (!passesSeverity(ftl_severity, context.severityThreshold))
            failed = true
        })
        context.resultsMatrix = resultsMatrix

        if (context.test && context.test.start && context.test.end) {
          const start = new Date(context.test.start)
          const end = new Date(context.test.end)
          const delta = (end - start) / 1000
          console.log(`Test duration: ${delta} seconds\n`)
        }
        
        if (failed) {
          console.log(`Test Results : FAILED \"${context.severityThreshold}\" severity threshold`)
          console.log(`${resultsMatrix.high} high, ${resultsMatrix.medium} medium, ${resultsMatrix.low} low severity`)
          console.log(`see: ${resultsUri.replace(':stlid', context.testId)}`)
          context.resultsMatrix = resultsMatrix
          statusResultsFailure(context)
          return context
        }

        console.log(`Test Results : PASSED \"${context.severityThreshold}\" severity threshold`)
        console.log(`${resultsMatrix.high} high, ${resultsMatrix.medium} medium, ${resultsMatrix.low} low severity`)
        console.log(`see: ${resultsUri.replace(':stlid', context.testId)}`)
        statusResultsSuccess(context)

        return context
      }
      else {
        statusResultsFailure(context)
        throw new Error('Failed to retrieve tests.')
      }

    }
  }
  catch(err) {
    console.error(err)
    return (err)
  }
}

module.exports = {
  createHook,
  deleteHook,
  testRepo,
}