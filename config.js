const appEnvironments = {
  devbat: 'devbat',
  development: 'staging',
  local: 'local',
  production: 'production',
  staging: 'staging',
}

const appEnvironment = appEnvironments[process.env['FTL_ENV']]

const bugcatcherUris = {
  devbat: process.env['API_URI_DEVBAT'],
  local: process.env['API_URI_DEVBAT'],
  production: process.env['API_URI_PRODUCTION'],
  staging: process.env['API_URI_STAGING'],
}

module.exports = {

  appEnvironment,
  appEnvironments,

  appUrl: ({
    development: 'https://code-certification-staging.herokuapp.com/',
    devbat: 'https://code-certification-staging.herokuapp.com/',
    local: 'https://code-certification-staging.herokuapp.com/',
    staging: 'https://code-certification-staging.herokuapp.com/',
    production: 'https://certification-api.fasterthanlight.dev/',
  })[appEnvironment],

  // bugcatcherUri is optional. The NPM package will default to production
  bugcatcherUri: bugcatcherUris[appEnvironment],
  bugcatcherUris,

  resultsUri: ({
    development: 'https://staging.tiger.sohotokenlabs.com/results?test=',
    devbat: 'http://localhost:3000/results?test=',
    local: 'http://localhost:3000/results?test=',
    staging: 'https://staging.tiger.sohotokenlabs.com/results?test=',
    production: 'https://bugcatcher.fasterthanlight.dev/results?test=',
  })[appEnvironment],
  
  scanResultsUri: ({
    development: 'https://staging.tiger.sohotokenlabs.com/results?scan=',
    devbat: 'http://localhost:3000/results?scan=',
    local: 'http://localhost:3000/results?scan=',
    staging: 'https://staging.tiger.sohotokenlabs.com/results?scan=',
    production: 'https://bugcatcher.fasterthanlight.dev/results?scan=',
  })[appEnvironment],
  
  labels: {
    setup: {
      context: "BugCatcher / Static Analysis",
      description: {
        setup: "Set up FTL static analysis tests",
        pending: "Setting up FTL static analysis...",
        error: "ERROR Setting up FTL static analysis",
        failure: "FAILED to setup FTL static analysis",
        success: "COMPLETED Setting up FTL static analysis",
      }
    },
    uploading: {
      context: "BugCatcher / Static Analysis",
      description: {
        setup: "Synchronize repository with BugCatcher",
        pending: "Synchronizing repository with BugCatcher...",
        error: "ERROR Synchronizing repository with BugCatcher",
        failure: "FAILED Synchronizing repository with BugCatcher",
        success: "COMPLETED Synchronization of repository",
      }
    },
    testing: {
      context: "BugCatcher / Static Analysis",
      description: {
        setup: "Perform Static Analysis testing",
        pending: "Performing Static Analysis testing...",
        pendingWithPercent: "Static Analysis testing (%percent_complete%% complete)...",
        error: "ERROR Performing Static Analysis testing",
        failure: "FAILURE Performing Static Analysis testing",
        success: "COMPLETED Static Analysis testing",
      }
    },
    results: {
      context: "BugCatcher / Static Analysis",
      description: {
        setup: "Fetch test results",
        pending: "Fetching test results...",
        error: "ERROR Getting test results",
        failure: "Found possible issues (%hits%)",
        success: "PASSED all tests with \"%severity%\" severity threshold",
      }
    },
  },

  statusSteps: {
    setup: 'setup',
    uploading: 'uploading',
    testing: 'testing',
    results: 'results',
  },

  statusStates: {
    error: 'error',
    failure: 'failure',
    pending: 'pending',
    pendingWithPercent: 'pendingWithPercent',
    setup: 'setup',
    success: 'success',
  },

  smtpAccount: {
    email: process.env['NODEMAILER_EMAIL'],
    password: process.env['NODEMAILER_PASSWORD'],
  },
  
}