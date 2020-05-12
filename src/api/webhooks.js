const { mongoConnect } = require('../mongo')
// const ObjectId = require('mongodb').ObjectId
// const nodeBugCatcher = require('node-bugcatcher')
// const apiUrl = process.env['API_URI_' + process.env['FTL_ENV'].toUpperCase()]
// const bugCatcherApi = nodeBugCatcher(apiUrl)

async function githubWebhook (request) {
  const { body, headers } = request
  const { "x-github-event": githubEvent } = headers

  if (!githubEvent || githubEvent !== 'push') return
  else {
    const { compare } = body
    if (!compare) return

    // reponse expected by GitHub
    const githubResponse = {"result":"ok"}

    // Look for a duplicate 
    const findKey = { "requestBody.compare": compare }
    const fn = async (db, promise) => {
      const githubScansCollection = db.collection('github_scans')
      const savedScan = await githubScansCollection.find(findKey)
        .toArray().catch(promise.reject)
      
      if (savedScan.length) promise.resolve(githubResponse)
      else {
        const saved = await githubScansCollection.updateOne(
          findKey,
          { $set: {
            requestBody: body
          }},
          { upsert: true }
        ).catch(promise.reject)

        if (saved) promise.resolve(githubResponse)
        else promise.reject()
      }
    }
    return mongoConnect(fn)

  }
}

module.exports = {
  githubWebhook,
}