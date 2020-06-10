if (process.env.NODE_ENV !== 'production') require('dotenv').config()

const cors = require('cors')
const express = require('express')
const app = express()
const port = process.env.PORT || 3000
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const api = require('./src/api')
const { authenticateToken } = require('./src/auth')

// middleware
app.use(express.json())
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'https://bugcatcher.fasterthanlight.dev',
      'https://staging.tiger.sohotokenlabs.com',
      'https://staging-sat.firebaseapp.com',
    ],
    credentials: true
  })
)
app.use(cookieParser())
app.use(bodyParser.json({limit: '150mb', extended: true}))
app.use(bodyParser.urlencoded({limit: '150mb', extended: true}))
// app.use((req, res, next) => {
//   console.log(req['method'], req['url'])
//   next()
// })

// error handling
apiError = (err, res) => {
  console.error(err)
  // res.send({ error: err.message || err })
  return res.sendStatus(500)
}


/**
 * @section Routes / Endpoints
 */

// root
app.get('/', (req, res) => {
  res.send(req.query)
})

// test db connection
app.get('/test/:param1/:param2', async (req, res) => {
  try {
    await api.testConnection()
    res.send({ params: req.params, query: req.query })
  } catch (err) { return apiError(err, res) }
})

// get a json web token and refresh token from a BugCatcher SID
app.get('/jwt/:sid', api.getToken)

// get new tokens from a refresh token
// app.post('/jwt/refresh', api.refreshToken)

// verify a jwt
app.head(
  '/jwt',
  authenticateToken,
  api.verifyToken
)

// remove refresh jwt
app.delete(
  '/jwt',
  authenticateToken,
  api.removeToken
)

// add webhook subscription
app.post(
  '/webhook/subscription/:channel/:environment',
  authenticateToken,
  api.putWebhookSubscription
)

// delete webhook subscription
app.delete(
  '/webhook/subscription/:channel/:environment', 
  authenticateToken,
  api.deleteWebhookSubscription
)

// webhooks
app.post('/webhook/:channel', async (req, res) => {
  try {
    res.send(await api.webhook(req))
  } catch (err) { return apiError(err, res) }
})

// save test results
app.post(
  '/results/:channel/:environment',
  authenticateToken,
  api.postTestResults
)

// get webhook scan by bugcatcher test_id
app.get(
  '/webhook/scan/:channel/:scan',
  authenticateToken,
  api.getWebhookScan
)

// get webhook subscriptions
app.get(
  '/webhook/subscriptions/:channel/:environment',
  authenticateToken,
  api.getWebhookSubscriptions
)

// init
app.listen(port, () => console.log(`Example app listening on port ${port}!`))

























/** @todo Restore these routes when we implement the code certification plan */
// // put results
// app.put('/results', async (req, res) => {
//   try {
//     res.send(await api.putResults(req, res))
//   } catch (err) { return apiError(err, res) }
// })

// // get results
// app.get('/results/:id', async (req, res) => {
//   try {
//     res.send(await api.getResults(req.params))
//   } catch (err) { return apiError(err, res) }
// })

// // put pdf data
// app.put('/pdf', async (req, res) => {
//   console.log("length=",JSON.stringify(req.body).length)
//   try {
//     res.send(await api.putPDF(req.body))
//   } catch (err) { return apiError(err, res) }
// })

// // get pdf data
// app.get('/pdf/:id', async (req, res) => {
//   try {
//     res.send(await api.getPDF(req.params))
//   } catch (err) { return apiError(err, res) }
// })

// // put jobs
// app.put('/jobs', async (req, res) => {
//   try {
//     res.send(await api.putJobs(req.body))
//   } catch (err) { return apiError(err, res) }
// })

// // get jobs
// app.get('/jobs/:sid', async (req, res) => {
//   try {
//     res.send(await api.getJobs(req.params))
//   } catch (err) { return apiError(err, res) }
// })

// // delete jobs
// app.delete('/jobs', async (req, res) => {
//   try {
//     res.send(await api.deleteJobs(req.body))
//   } catch (err) { return apiError(err, res) }
// })

// // add pull request
// app.post('/pr', async (req, res) => {
//   try {
//     res.send(await api.postPR(req.body))
//   } catch (err) { return apiError(err, res) }
// })
