const MongoClient = require('mongodb').MongoClient
const assert = require('assert')

// Import some environment variables
const {
  CQC_DBNAME: dbName,
  CQC_DBURI: dbUri,
  CQC_DBUSER: dbUser,
  CQC_DBPASSWORD: dbPassword
} = process.env

// Connection URL
const mongoUri = `mongodb://${dbUser}:${encodeURIComponent(dbPassword)}@${dbUri}`
console.log(`Using database: ${dbName} on ${dbUri}`)

module.exports = {
  mongoConnect: (fn) => {
    return new Promise(async (resolve, reject) => {
      try {
        const mongo = new MongoClient(mongoUri, { useUnifiedTopology: true })
        mongo.connect(async (err) => {
          assert.equal(null, err)
      
          const db = mongo.db(dbName)
          const promise = { resolve, reject }
          await fn(db, promise)
          mongo.close()
        })
      } catch (err) { reject(err.message || err) }
    })
  }
}
