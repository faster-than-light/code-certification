const { mongoConnect } = require('../mongo')
const github = require('./github')
const nodeBugCatcher = require('node-bugcatcher')
const { appEnvironment, bugcatcherUri } = require('../../config')
const bugCatcherApi = nodeBugCatcher(bugcatcherUri)

async function githubWebhook (request) {
  try {
    const { body, headers } = request
    const { "x-github-event": githubEvent } = headers
    const { compare } = body

    // Only process `push` events with a `compare` value
    if (!compare || !githubEvent || githubEvent !== 'push') return
    else {
      const { head_commit: headCommit = {}, ref, repository = {} } = body
      const { full_name: reposistoryFullName } = repository
      const { tree_id: treeId } = headCommit

      if (!treeId) return

      // Upsert the webhook data to prevent multiple tests from firing
      const findKey = { "webhookBody.compare": compare }
      const fnUpsertScan = async (db, promise) => {
        const githubScansCollection = db.collection('githubScans')
        const savedScan = await githubScansCollection.updateOne(
          findKey,
          { $set: {
            webhookBody: body,
          }},
          { upsert: true }
        ).catch(promise.reject)

        if (savedScan) {
          promise.resolve(successfulWebhookResponse)
        }
        else promise.reject()
      }
      mongoConnect(fnUpsertScan)

      // Reponse expected by GitHub
      const successfulWebhookResponse = {"result":"ok"}

      // Get a collection of users subscribed to this event
      // db function
      const fnGetSubscribers = async (db, promise) => {
        const data = await db.collection('webhookSubscriptions').find(
          {
            ref,
            repository: reposistoryFullName,
            environment: appEnvironment,
          }
        ).toArray().catch(promise.reject)
        promise.resolve(data)
      }
      const subscriberSids = await mongoConnect(fnGetSubscribers).catch(() => [])
      if (!subscriberSids || !subscriberSids.length) return successfulWebhookResponse
      
      // Get an ephemeral GitHub token for each subscriber
      let subscriberPromises = new Array()
      subscriberSids.forEach(subscriberSid => {
        const sid = subscriberSid['sid']
        bugCatcherApi.setSid(sid)
        const subscriberPromise = bugCatcherApi.getUserData({ sid })
        subscriberPromises.push([subscriberPromise, sid])
      })
      const subscriberResults = await Promise.all(subscriberPromises.map(s => s[0]))
      const subscribers = subscriberResults.map((s, i) => ({
        ...s.data,
        sid: subscriberPromises[i][1],
      }))

      // Run 1 test on BugCatcher and save results as `githubScans.bugcatcherResults`
      request.user = subscribers.find(s => s.sid && s.github_token)
      if (!request.user) return

      const asyncOps = async () => {
        const testRepo = await github.testRepo(request)
        const testResults = testRepo.results

        /** @todo Email each subscriber */

        // Upsert the results
        const fn = async (db, promise) => {
          const githubScansCollection = db.collection('githubScans')
          const savedScan = await githubScansCollection.updateOne(
            findKey,
            { $set: {
              testResults,
              webhookBody: body,
            }},
            { upsert: true }
          ).catch(promise.reject)

          if (savedScan) {
            promise.resolve(successfulWebhookResponse)
          }
          else promise.reject()
        }
        mongoConnect(fn)
      }

      asyncOps()
      return successfulWebhookResponse

    }
  }
  catch(err) {
    console.error(err)
    return (err)
  }
}

/**
 * @title webhookSubscription
 * @dev saves/updates webhook subscription
 * 
 * @param {string} channel Path variable for the channel (ie. github) POSTing data
 * @param {object} body POST body data object
 * @param {string} body.ref The repository ref to subscribe to
 * @param {string} body.repository The repository full_name to subscribe to
 * @param {string} body.sid The subscriber's BugCatcher token
 * 
 * @returns {object} Response object containing the request body data plus user email
 */
async function webhookSubscription(request) {

  // validation
  const { body = {}, params = {}, user } = request
  const { ref, repository, sid } = body
  const { channel } = params
  if (!body || !params || !channel || !ref || !repository || !sid) return

  // verify the user by `sid`
  if (!user) return
  else {
    // save subscription data
    const { email } = user

    // db function
    const fn = async (db, promise) => {
      const data = {
        email,
        environment: appEnvironment,
        ref,
        repository,
        sid,
      }
      await db.collection('webhookSubscriptions').updateOne(
        {
          email,
          ref,
          repository,
          environment: appEnvironment,
        },
        { $set: data },
        { upsert: true }
      ).catch(promise.reject)
      promise.resolve(data)
    }
    return mongoConnect(fn)
  }
  
}

module.exports = {
  githubWebhook,
  webhookSubscription,
}