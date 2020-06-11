const nodemailer = require('nodemailer')
const { smtpAccount } = require('../../config')

const auth = {
  user: smtpAccount['email'],
  pass: smtpAccount['password'],
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth,
})
  
const sendMail = (to, subject, text) => {
  if (!to || !subject || !text) throw 'missing parameters'

  transporter.sendMail({
    from: smtpAccount['email'],
    to,
    subject,
    text,
  }, function(error, info){
    if (error) console.log(error)
    else console.log('Email sent: ' + info.response)
  })
}

module.exports = {
  sendMail,
}
