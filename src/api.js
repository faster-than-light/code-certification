const { mongoConnect } = require('./mongo')
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
  const validUser = await checkUser(results.user)
  if (!validUser) throw new Error(`Invalid token for user ${results.user.email}`)

  // remove sensitive user info
  results.user = { email: results.user.email }

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
  else return user.email === verifiedUser.email
}

module.exports = {
  getPDF,
  getResults,
  putPDF,
  putResults,
  testConnection,
}