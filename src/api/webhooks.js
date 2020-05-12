const { mongoConnect } = require('../mongo')

async function githubWebhook (request) {
  try {
    const { body, headers } = request
    const { "x-github-event": githubEvent } = headers
    const { compare } = body

    // Only process `push` events with a `compare` value
    if (!compare || !githubEvent || githubEvent !== 'push') return
    else {
      const { head_commit: headCommit } = body
      const { tree_id: treeId } = headCommit

      // Get a collection of users subscribed to this event
      // Get an ephemeral GitHub token for each subscriber
      // Run 1 test on BugCatcher and save results as `githubScans.bugcatcherResults`
      // Email each subscriber

      // Reponse expected by GitHub
      const successfulWebhookResponse = {"result":"ok"}

      // Look for a duplicate 
      const findKey = { "webhookBody.compare": compare }
      const fn = async (db, promise) => {
        const githubScansCollection = db.collection('githubScans')
        const savedScan = await githubScansCollection.find(findKey)
          .toArray().catch(promise.reject)
        
        if (savedScan.length) {
          console.log(`Compare found: ${compare}`)
          promise.resolve(successfulWebhookResponse)
        }
        else {
          const saved = await githubScansCollection.updateOne(
            findKey,
            { $set: {
              webhookBody: body
            }},
            { upsert: true }
          ).catch(promise.reject)

          if (saved) {
            console.log(`Compare saved: ${compare}`)

            /** @todo Fetch repo and run test */
            promise.resolve(successfulWebhookResponse)
          }
          else promise.reject()
        }
      }
      return mongoConnect(fn)
    }
  }
  catch(err) {
    console.error(err)
    return (err)
  }
}

module.exports = {
  githubWebhook,
}