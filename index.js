if (process.env.NODE_ENV !== 'production') require('dotenv').config()
const cors = require('cors')
const express = require('express')
const app = express()
const port = process.env.PORT || 3000
const api = require('./src/api')

// middleware
app.use(express.json())
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
    const putResults = await api.putResults(req.body)
    res.send(putResults)
  } catch (err) { return apiError(err, res) }
})

// get results
app.get('/results/:id', async (req, res) => {
  try {
    const getResults = await api.getResults(req.params)
    res.send(getResults)
  } catch (err) { return apiError(err, res) }
})

// put pdf data
app.put('/pdf', async (req, res) => {
  try {
    const putPDF = await api.putPDF(req.body)
    res.send(putPDF)
  } catch (err) { return apiError(err, res) }
})

// get pdf data
app.get('/pdf/:id', async (req, res) => {
  try {
    const getPDF = await api.getPDF(req.params)
    res.send(getPDF)
  } catch (err) { return apiError(err, res) }
})

// init
app.listen(port, () => console.log(`Example app listening on port ${port}!`))