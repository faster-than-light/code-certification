if (process.env.NODE_ENV !== 'production') require('dotenv').config()
const cors = require('cors')
const express = require('express')
const app = express()
const port = process.env.PORT || 3000
const bodyParser = require('body-parser')
const api = require('./src/api')

// middleware
app.use(express.json())
app.use(bodyParser.json({limit: '150mb', extended: true}))
app.use(bodyParser.urlencoded({limit: '150mb', extended: true}))
app.use(cors())

// error handling
apiError = (err, res) => {
  console.error(err)
  res.send({ error: err.message || err })
  return null
}


/**
 * @section Routes / Endpoints
 */

// root
app.get('/', (req, res) => {
  try {
    res.send(req.query)
  } catch (err) { return apiError(err, res) }
})

// test db connection
app.get('/test/:param1/:param2', async (req, res) => {
  try {
    await api.testConnection()
    res.send({ ...req.params, query: req.query })
  } catch (err) { return apiError(err, res) }
})

// put results
app.put('/results', async (req, res) => {
  try {
    res.send(await api.putResults(req.body))
  } catch (err) { return apiError(err, res) }
})

// get results
app.get('/results/:id', async (req, res) => {
  try {
    res.send(await api.getResults(req.params))
  } catch (err) { return apiError(err, res) }
})

// put pdf data
app.put('/pdf', async (req, res) => {
  console.log("length=",JSON.stringify(req.body).length)
  try {
    res.send(await api.putPDF(req.body))
  } catch (err) { return apiError(err, res) }
})

// get pdf data
app.get('/pdf/:id', async (req, res) => {
  try {
    res.send(await api.getPDF(req.params))
  } catch (err) { return apiError(err, res) }
})

// put jobs
app.put('/jobs', async (req, res) => {
  try {
    res.send(await api.putJobs(req.body))
  } catch (err) { return apiError(err, res) }
})

// get jobs
app.get('/jobs/:sid', async (req, res) => {
  try {
    res.send(await api.getJobs(req.params))
  } catch (err) { return apiError(err, res) }
})

// delete jobs
app.delete('/jobs', async (req, res) => {
  try {
    res.send(await api.deleteJobs(req.body))
  } catch (err) { return apiError(err, res) }
})

// add pull request
app.post('/pr', async (req, res) => {
  try {
    res.send(await api.postPR(req.body))
  } catch (err) { return apiError(err, res) }
})

// webhook subscriptions
app.post('/webhook/subscription/:channel', async (req, res) => {
  try {
    res.send(await api.putWebhookSubscription(req))
  } catch (err) { return apiError(err, res) }
})

// webhooks
app.post('/webhook/:channel', async (req, res) => {
  try {
    res.send(await api.webhook(req))
  } catch (err) { return apiError(err, res) }
})

// get webhook scan by bugcatcher test_id
app.get('/webhook/scan/:channel/:scan', async (req, res) => {
  try {
    res.send(
      await api.getWebhookScan(req)
    )
  } catch (err) { return apiError(err, res) }
})

// get webhook subscriptions
app.get('/webhook/subscriptions/:channel/:sid', async (req, res) => {
  try {
    res.send(await api.getWebhookSubscriptions(req))
  } catch (err) { return apiError(err, res) }
})

// init
app.listen(port, () => console.log(`Example app listening on port ${port}!`))