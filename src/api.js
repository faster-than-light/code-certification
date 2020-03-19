const { mongoConnect } = require('./mongo')
const ObjectId = require('mongodb').ObjectId
const nodeBugCatcher = require('node-bugcatcher')
const bugCatcherApi = nodeBugCatcher('https://api.staging.bugcatcher.fasterthanlight.dev/')

/**
 * @title testConnection
 * 
 * @dev Test for a connection to the MongoDB database
 */
function testConnection() {
  // db function
  const fn = async (db, promise) => {
    const results = await db.collection('users').findOne()
      .catch(() => false)
    if (results === false) promise.reject('no connection')
    else promise.resolve(results)
  }
  return mongoConnect(fn)
}

/**
 * @title putUser
 * @dev saves/updates a user
 * 
 * @param {object} user User object 
 * 
 * @returns {object} User
 */
// async function putUser(user) {
//   // validation
//   if (!user || !user.sid) return

//   // verify the user and sid
//   const valid = await checkUser(user)
//   if (!valid) throw new Error(`Invalid token for user ${user.email}`)

//   // db function
//   const fn = async (db, promise) => {
//     await db.collection('users').updateOne(
//       { email: user.email },
//       { $set: user },
//       { upsert: true }
//     ).catch(promise.reject)
    
//     promise.resolve(user)
//   }
//   return mongoConnect(fn)
// }

/**
 * @title putResults
 * @dev saves/updates test results
 * 
 * @param {object} results Results object with appended User object
 * 
 * @returns {string} stlid of test results
 */
async function putResults(results) {
  // validation
  if (!results || !results.test_run || !results.test_run.stlid) return
  if (!results.user || !results.user.sid) return

  // verify the user and sid
  let user = await checkUser(results.user)
  if (!user) throw new Error(`Invalid token for user ${results.user.email}`)

  // add number of files tested
  results.test_run.total_files_tested = results.test_run.codes.length

  // db function
  const fn = async (db, promise) => {
    await db.collection('results').updateOne(
      { "test_run.stlid": results.test_run.stlid },
      { $set: results },
      { upsert: true }
    ).catch(promise.reject)
    
    promise.resolve(results.test_run.stlid)
  }
  return mongoConnect(fn)
}

/**
 * @title getResults
 * @dev Fetches test results
 * 
 * @param {string} id The stlid of test results
 * 
 * @returns {object} Test results object
 */
async function getResults(params) {
  // validation
  if (!params.id) return
  const testId = params.id

  // db function
  const fn = async (db, promise) => {
    const results = await db.collection('results').find({
      "test_run.stlid": testId
    }).toArray().catch(promise.reject)

    if (!results.length) promise.reject('not found')
    else {
      results[0].user = undefined
      promise.resolve(results[0])
    }
  }
  return mongoConnect(fn)
}

/**
 * @title putPDF
 * @dev saves/updates test results PDF
 * 
 * @param {object} pdfData Results PDF data object
 * 
 * @returns {string} stlid of test results
 */
async function putPDF(pdfData) {
  const { blob, stlid, user } = pdfData

  // validation
  if (!pdfData || !stlid || !blob) return
  if (!user || !user.sid) return

  // verify the user and sid
  const validUser = await checkUser(user)
  if (!validUser) throw new Error(`Invalid token for user ${user.email}`)

  // db function
  const fn = async (db, promise) => {
    await db.collection('pdf').updateOne(
      { stlid },
      { 
        $set: {
          blob,
          stlid
        }
      },
      { upsert: true }
    ).catch(promise.reject)
    
    promise.resolve(stlid)
  }
  return mongoConnect(fn)
}

/**
 * @title getPDF
 * @dev Fetches test results PDF
 * 
 * @param {string} params.stlid The stlid of test results PDF
 * 
 * @returns {blob} base64 PDF Results blob
 */
async function getPDF(params) {
  // validation
  if (!params.id) return
  const stlid = params.id

  // db function
  const fn = async (db, promise) => {
    const results = await db.collection('pdf').find({
      stlid
    }).toArray().catch(promise.reject)

    if (!results.length) promise.reject('not found')
    else {
      promise.resolve(results[0]['blob'])
    }
  }
  return mongoConnect(fn)
}

/**
 * @title putJobs
 * @dev saves/updates jobs
 * 
 * @param {object} data.jobs Jobs queue items object
 * @param {object} data.user User object
 * 
 * @returns {boolean} Results saves boolean
 */
async function putJobs(data) {
  let { jobs, user: userObject } = data

  // validation
  if (!data || !jobs || !userObject) return
  if (!Array.isArray(jobs) || typeof userObject !== 'object' ) return

  // verify the user and sid
  const user = await checkUser(userObject)
  if (!user) throw new Error(`Invalid token for user ${userObject.email}`)

  const fn = async (db, promise) => {
    // upsert each job as a doc
    /** @todo Batch/bulk upsert the data */
    const jobsCollection = db.collection('jobs')
    let errors = [], savedJobs = []
    for (let i = 0; i < jobs.length; i++) {
      let job = jobs[i]
      job.user = { email: user.email }
      const jobId = job._id
      delete job._id
      const saved = await jobsCollection.findOneAndUpdate(
        {
          "_id": ObjectId(jobId),
          "user.email": user.email
        },
        { $set: job },
        { upsert: true }
      ).catch(e => {errors.push(e || "error saving")})
      if (saved) {
        const updated = saved['value'] ? saved['value']['_id'] : null
        const upserted = saved['lastErrorObject']['upserted']
        job._id = updated || upserted
        delete job.user
        savedJobs.push(job)
      }
    }
    if (errors.length) promise.reject(errors)
    promise.resolve(savedJobs)
  }
  return mongoConnect(fn)
}

/**
 * @title getJobs
 * @dev Returns saved jobs
 * 
 * @param {object} user User object containing `sid`
 * 
 * @returns {array} Results
 */
async function getJobs(user) {

  // validation
  if (!user || typeof user !== 'object' || !user.email || !user.sid) {
    throw new Error(`invalid user`)
  }

  // verify the user and sid
  const verifiedUser = await checkUser(user)
  if (!verifiedUser) throw new Error(`Invalid token for user ${user.email}`)

  const fn = async (db, promise) => {
    const jobsCollection = db.collection('jobs')
    let jobs = await jobsCollection.find({
      "user.email": user.email
    }).toArray().catch(promise.reject)
    console.log(jobs)
    if (jobs) {
      jobs.forEach(j => { delete j.user })
      promise.resolve(jobs)
    }
  }
  return mongoConnect(fn)
}

/**
 * @title checkUser
 * @dev Query the BugCatcher server to confirm the `user.email` matches the `sid`
 * 
 * @param {object} user 
 */
async function checkUser(user) {
  // validation
  if (!user || !user.sid) return

  // send our own request for the user data
  bugCatcherApi.setSid( user.sid )
  const getUserData = await bugCatcherApi.getUserData( user )
    .catch(() => ({}))
  const { data: verifiedUser } = getUserData
  if (!verifiedUser) return
  if (user.email !== verifiedUser.email) return
  else return ({
    // remove sensitive user info
    email: verifiedUser.email,
    name: verifiedUser.name,
    picture_link: verifiedUser.picture_link,
  })
}

module.exports = {
  getJobs,
  getPDF,
  getResults,
  putJobs,
  putPDF,
  putResults,
  testConnection,
}