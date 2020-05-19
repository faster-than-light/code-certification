const { mongoConnect } = require('../mongo')
const ObjectId = require('mongodb').ObjectId
const github = require('./github')
const nodeBugCatcher = require('node-bugcatcher')
const { appEnvironment, bugcatcherUri, bugcatcherUris } = require('../../config')
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

      const successfulWebhookResponse = {"result":"ok"}

      // Upsert the webhook data to prevent multiple tests from firing
      const scansFindKey = { "webhookBody.compare": compare }
      // db function
      const fnUpsertScan = async (db, promise) => {
        const githubScansCollection = db.collection('githubScans')
        const savedScan = await githubScansCollection.updateOne(
          scansFindKey,
          { $set: {
            webhookBody: body,
          }},
          { upsert: true }
        ).catch(promise.reject)

        if (savedScan) promise.resolve(savedScan)
        else promise.reject()
      }
      mongoConnect(fnUpsertScan)

      // Reponse expected by GitHub
      const subscriptionQuery = {
        channel: 'github',
        ref,
        repository: reposistoryFullName,
      }

      // Get a collection of users subscribed to this event
      // db function
      const fnGetSubscribers = async (db, promise) => {
        const data = await db.collection('webhookSubscriptions').find(
          subscriptionQuery
        ).toArray().catch(promise.reject)
        promise.resolve(data)
      }
      const subscriberSids = await mongoConnect(fnGetSubscribers).catch(() => [])
      console.log({
        subscriptionQuery,
        subscriberSids,
      })
      if (!subscriberSids || !subscriberSids.length) return successfulWebhookResponse
      
      // Get an ephemeral GitHub token for each subscriber
      let subscriberPromises = new Array()
      subscriberSids.forEach(subscriberSid => {
        const environment = subscriberSid['environment'] || 'production'
        const sid = subscriberSid['sid']
        bugCatcherApi.setApiUri(bugcatcherUris[environment])
        bugCatcherApi.setSid(sid)
        const subscriberPromise = bugCatcherApi.getUserData({ sid }).catch(() => undefined)
        subscriberPromises.push([subscriberSid, subscriberPromise])
      })
      const subscriberResults = await Promise.all(subscriberPromises.map(s => s[1]))
      const userSubscriptions = subscriberResults.map((s, i) => {
        if (s && s['data']) return ({
          ...subscriberPromises[i][0],
          ...s.data,
        })
        else return
      }).filter(s => s)

      // Run 1 test on BugCatcher and save results as `githubScans.bugcatcherResults`
      request.user = userSubscriptions.find(s => s['sid'] && s['github_token'])
      console.log({userSubscriptions, user: request.user})
      if (!request.user) return

      // At this point, we want to return a response and then finish some operations afterward
      const asyncOps = async () => {
        /** @dev This is meant to be executed asyncronously just before returning the response */
        
        const testRepo = await github.testRepo(request)
        console.log({testRepo})
        const { results: testResults, tree } = testRepo

        /** @todo Email each subscriber */

        // Upsert the results
        // db function
        const fnUpsertGithubScans = async (db, promise) => {
          const githubScansCollection = db.collection('githubScans')
          const savedScan = await githubScansCollection.findOne(
            scansFindKey
          ).catch(() => undefined)
          const updatedScan = await githubScansCollection.updateOne(
            { _id: savedScan['_id']},
            { $set: {
              testResults,
              tree,
            }}
          ).catch(() => undefined)

          if (updatedScan) promise.resolve(savedScan['_id'])
          else promise.reject()
        }
        const savedGithubScan = await mongoConnect(fnUpsertGithubScans).catch(() => undefined)
        if (!savedGithubScan) return

        // Save updated webhookSubscriptions
        // db function
        const fnUpdateWebhookSubscriptions = async (db, promise) => {

          const webhookSubscriptionsCollection = db.collection('webhookSubscriptions')

          const webhookSubscriptions = await webhookSubscriptionsCollection.updateMany(
            subscriptionQuery,
            { $set: { githubScans_id: savedGithubScan } }
          ).catch(promise.reject)
          promise.resolve(webhookSubscriptions)
        }
        const webhookSubscriptions = await mongoConnect(fnUpdateWebhookSubscriptions).catch(() => undefined)
        if (webhookSubscriptions) console.log(`Saved GitHub webhook scan ${savedGithubScan}`)
        
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
 * @title putWebhookSubscription
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
async function putWebhookSubscription(request) {

  // validation
  const { body = {}, params = {}, user } = request
  const { ref, repository, sid } = body
  const { channel, environment } = params
  if (!body || !params || !channel || !environment || !ref || !repository || !sid) return

  // verify the user by `sid`
  if (!user) return
  else {
    // Create webhook on GitHub
    const createWebhookPayload = {
      body: {
        owner: repository.split('/')[0],
        repo: repository.split('/')[1],
      },
      user,
    }
    let createdWebhook = await github.createHook(createWebhookPayload)
    .catch(() => null)
    if (!createdWebhook) return
    else createdWebhook = createdWebhook['data']

    // look for previous tests on this repo
    // db function
    const dbFnGetScan = async (db, promise) => {
      const githubScansCollection = db.collection('githubScans')
      const githubScan = await githubScansCollection
        .find({
          "webhookBody.ref": ref,
          "webhookBody.repository.full_name": repository,
        })
        .sort({"webhookBody.head_commit.timestamp": -1})
        .limit(1)
        .toArray()
      promise.resolve(githubScan)
    }
    const scan = await mongoConnect(dbFnGetScan)
    const lastScan = scan && scan.length ? scan[0] : null
    const lastScanTreeSha = lastScan ? lastScan['webhookBody']['head_commit']['tree_id'] : null

    // if neccessary, run a test on the tree
    const testNeededOnTreeSha = !createdWebhook ? true :
      lastScanTreeSha !== createdWebhook['repoTreeSha'] ? createdWebhook['repoTreeSha'] : null

    // save subscription data
    const { email } = user

    // db function
    const fnUpsertWebhookSubscription = async (db, promise) => {
      const data = {
        channel,
        email,
        environment,
        ref,
        repository,
        sid,
      }
      const updateSubscriptionQuery = {
        channel,
        email,
        ref,
        repository,
        environment,
      }
      const webhookSubscriptionsCollection = db.collection('webhookSubscriptions')
      await webhookSubscriptionsCollection.updateOne(
        updateSubscriptionQuery,
        { $set: data },
        { upsert: true }
      ).catch(promise.reject)
      const savedSubscription = await webhookSubscriptionsCollection.findOne(
        updateSubscriptionQuery
      )
      if (savedSubscription) {
        if (testNeededOnTreeSha) savedSubscription['testNeededOnTreeSha'] = testNeededOnTreeSha
        else savedSubscription['lastScan'] = lastScan
      }
      promise.resolve(savedSubscription)
    }
    const upsertWebhookSubscription = await mongoConnect(fnUpsertWebhookSubscription)
    if (upsertWebhookSubscription) return upsertWebhookSubscription
  }
  
}

/**
 * @title deleteWebhookSubscription
 * @dev saves/updates webhook subscription
 * 
 * @param {string} channel Path variable for the channel (ie. github) POSTing data
 * @param {object} body DELETE body data object
 * @param {string} body.ref The repository ref to subscribe to
 * @param {string} body.repository The repository full_name to subscribe to
 * @param {string} body.sid The subscriber's BugCatcher token
 * 
 * @returns {object} Response object containing the request body data plus user email
 */
async function deleteWebhookSubscription(request) {

  // validation
  const { body = {}, params = {}, user } = request
  const { ref, repository, sid } = body
  const { channel, environment } = params
  if (!body || !params || !channel || !environment || !ref || !repository || !sid) return

  // verify the user by `sid`
  if (!user) return
  else {
    // delete webhook from GitHub
    const deleteWebhookPayload = {
      body: {
        owner: repository.split('/')[0],
        repo: repository.split('/')[1],
      },
      user,
    }
    await github.deleteHook(deleteWebhookPayload).catch(() => ({}))

    // delete subscription data
    const { email } = user

    // db function
    const fnDeleteWebhookSubscription = async (db, promise) => {
      const deleteSubscriptionQuery = {
        channel,
        email,
        ref,
        repository,
        environment,
      }
      const webhookSubscriptionsCollection = db.collection('webhookSubscriptions')
      const deletedSubscription = await webhookSubscriptionsCollection.deleteOne(
        deleteSubscriptionQuery,
      ).catch(promise.reject)
      promise.resolve(deletedSubscription)
    }
    return mongoConnect(fnDeleteWebhookSubscription)
  }
  
}

async function getWebhookSubscriptions(request) {
  // validation
  const { params = {}, user = {} } = request
  const { channel } = params
  const { email } = user
  if (!params || !user || !channel || !email) return

  // db function
  const fnGetSubscriptions = async (db, promise) => {
    const subscriptionQuery = {
      channel,
      email,
      environment: appEnvironment,
    }
    const webhookSubscriptionsCollection = db.collection('webhookSubscriptions')
    const webhookSubscriptions = await webhookSubscriptionsCollection
      .find(subscriptionQuery).toArray()
    promise.resolve(webhookSubscriptions)
  }
  const getSubscriptions = await mongoConnect(fnGetSubscriptions)
  if (!getSubscriptions || !getSubscriptions.length) return []

  let githubScanPromises = new Array()
  getSubscriptions.forEach(s => {
    githubScanPromises.push([
      s,
      mongoConnect(
        async (db, promise) => {
          const githubScansCollection = db.collection('githubScans')
          const githubScans = await githubScansCollection.findOne({
            _id: s.githubScans_id,
          }).catch(promise.reject)
          promise.resolve(githubScans)
        }
      )
    ])
  })
  const scanResults = await Promise.all(githubScanPromises.map(s => s[1]))
  const scans = scanResults.map((s, i) => ({
    ...githubScanPromises[i][0],
    githubScans_id: undefined,
    scan: s,
  }))
  return scans
}

async function getWebhookScan(request) {
  // validation
  const { params = {}, user } = request
  const { channel, scan } = params
  if (!channel || !scan || !user) return

  // Find the scan
  // db function
  const dbFnGetScan = async (db, promise) => {
    const githubScansCollection = db.collection('githubScans')
    const githubScan = await githubScansCollection
      .findOne({
        _id: ObjectId(scan),
      })
    promise.resolve(githubScan)
  }
  return mongoConnect(dbFnGetScan)

}

async function postTestResults (request) {
  try {
    // validation
    const { body = {}, params = {} } = request
    const { scan, sid } = body
    const { channel, environment } = params
    if (!body || !params || !channel || !environment || !scan || !sid) return
  
    const { head_commit: headCommit = {}, ref, repository = {} } = body
    const { full_name: reposistoryFullName } = repository
    const { tree_id: treeId } = headCommit

    if (!treeId) return

    const successfulWebhookResponse = {"result":"ok"}

    // Upsert the webhook data to prevent multiple tests from firing
    const scansFindKey = { "webhookBody.compare": compare }
    // db function
    const fnUpsertScan = async (db, promise) => {
      const githubScansCollection = db.collection('githubScans')
      const savedScan = await githubScansCollection.updateOne(
        scansFindKey,
        { $set: {
          webhookBody: body,
        }},
        { upsert: true }
      ).catch(promise.reject)

      if (savedScan) promise.resolve(savedScan)
      else promise.reject()
    }
    mongoConnect(fnUpsertScan)

    // Reponse expected by GitHub
    const subscriptionQuery = {
      channel: 'github',
      ref,
      repository: reposistoryFullName,
    }

    // Get a collection of users subscribed to this event
    // db function
    const fnGetSubscribers = async (db, promise) => {
      const data = await db.collection('webhookSubscriptions').find(
        subscriptionQuery
      ).toArray().catch(promise.reject)
      promise.resolve(data)
    }
    const subscriberSids = await mongoConnect(fnGetSubscribers).catch(() => [])
    console.log({
      subscriptionQuery,
      subscriberSids,
    })
    if (!subscriberSids || !subscriberSids.length) return successfulWebhookResponse
    
    // Get an ephemeral GitHub token for each subscriber
    let subscriberPromises = new Array()
    subscriberSids.forEach(subscriberSid => {
      const environment = subscriberSid['environment'] || 'production'
      const sid = subscriberSid['sid']
      bugCatcherApi.setApiUri(bugcatcherUris[environment])
      bugCatcherApi.setSid(sid)
      const subscriberPromise = bugCatcherApi.getUserData({ sid }).catch(() => undefined)
      subscriberPromises.push([subscriberSid, subscriberPromise])
    })
    const subscriberResults = await Promise.all(subscriberPromises.map(s => s[1]))
    const userSubscriptions = subscriberResults.map((s, i) => {
      if (s && s['data']) return ({
        ...subscriberPromises[i][0],
        ...s.data,
      })
      else return
    }).filter(s => s)

    // Run 1 test on BugCatcher and save results as `githubScans.bugcatcherResults`
    request.user = userSubscriptions.find(s => s['sid'] && s['github_token'])
    console.log({user: request.user})
    if (!request.user) return

    // At this point, we want to return a response and then finish some operations afterward
    const asyncOps = async () => {
      /** @dev This is meant to be executed asyncronously just before returning the response */
      
      const testRepo = await github.testRepo(request)
      console.log({testRepo})
      const { results: testResults, tree } = testRepo

      /** @todo Email each subscriber */

      // Upsert the results
      // db function
      const fnUpsertGithubScans = async (db, promise) => {
        const githubScansCollection = db.collection('githubScans')
        const savedScan = await githubScansCollection.findOne(
          scansFindKey
        ).catch(() => undefined)
        const updatedScan = await githubScansCollection.updateOne(
          { _id: savedScan['_id']},
          { $set: {
            testResults,
            tree,
          }}
        ).catch(() => undefined)

        if (updatedScan) promise.resolve(savedScan['_id'])
        else promise.reject()
      }
      const savedGithubScan = await mongoConnect(fnUpsertGithubScans).catch(() => undefined)
      if (!savedGithubScan) return

      // Save updated webhookSubscriptions
      // db function
      const fnUpdateWebhookSubscriptions = async (db, promise) => {

        const webhookSubscriptionsCollection = db.collection('webhookSubscriptions')

        const webhookSubscriptions = await webhookSubscriptionsCollection.updateMany(
          subscriptionQuery,
          { $set: { githubScans_id: savedGithubScan } }
        ).catch(promise.reject)
        promise.resolve(webhookSubscriptions)
      }
      const webhookSubscriptions = await mongoConnect(fnUpdateWebhookSubscriptions).catch(() => undefined)
      if (webhookSubscriptions) console.log(`Saved GitHub webhook scan ${savedGithubScan}`)
      
    }

    asyncOps()
    return successfulWebhookResponse

  }
  catch(err) {
    console.error(err)
    return (err)
  }
}


module.exports = {
  deleteWebhookSubscription,
  getWebhookScan,
  getWebhookSubscriptions,
  githubWebhook,
  postTestResults,
  putWebhookSubscription,
}