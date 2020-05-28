const date = new Date()
const expires = date.getTime() + 30*60000
const expiresDate = new Date(expires)

console.log({date, expiresDate})
