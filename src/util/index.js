const { labels, resultsUri, statusStates, statusSteps } = require('../../config')

const getRepoInfo = payload => {
  const { head_commit, ref, repository, sha: payloadSha } = payload
  const branch = ref.replace(/refs\/heads\//g, '')
  const projectName = [repository.full_name, branch].join('/tree/')
  const owner = repository.full_name.split('/')[0]
  const repo = repository.full_name.split('/')[1]
  const sha = head_commit ? head_commit.id : payloadSha
  return { owner, projectName, repo, sha }
}

const setStatusObj = (context, step, state) => {
  const { owner, repo, sha } = getRepoInfo(context.payload)
  step = statusSteps[step]
  state = statusStates[state]
  return ({
    owner,
    repo,
    context: labels[step].context,
    description: labels[step].description[state],
    state,
    sha,
  })
}

const sendStatusUpdate = (context, step, state) => {
  context.github.repos.createStatus(
    setStatusObj(
      context,
      statusSteps[step],
      statusStates[state]
    )
  )
}

const sendSetupStatusUpdate = (context, step) => {
  let status = setStatusObj(
    context,
    statusSteps[step],
    statusStates['setup']
  )
  status.state = statusStates.pending
  context.github.repos.createStatus( status )
}

const statusSetupPending = context => {
  sendStatusUpdate(
    context,
    statusSteps.setup,
    statusStates.pending
  )
}

const statusSetupFailure = context => {
  sendStatusUpdate(
    context,
    statusSteps.setup,
    statusStates.failure
  )
}

const statusSetupFailureRepoMismatch = context => {
  let status = setStatusObj(
    context,
    statusSteps.setup,
    statusStates.failure
  )
  status.description = "The decrypted token is for a different repository"
  context.github.repos.createStatus(status)
}

const statusSetupSuccess = context => {
  sendStatusUpdate(
    context,
    statusSteps.setup,
    statusStates.success
  )
}

const statusUploadingSetup = context => {
  sendSetupStatusUpdate(context, statusSteps.uploading)
}

const statusUploadingPending = context => {
  sendStatusUpdate(
    context,
    statusSteps.uploading,
    statusStates.pending
  )
}

const statusUploadingSuccess = context => {
  sendStatusUpdate(
    context,
    statusSteps.uploading,
    statusStates.success
  )
}

const statusUploadingFailure = context => {
  sendStatusUpdate(
    context,
    statusSteps.uploading,
    statusStates.failure
  )
}

const statusTestingSetup = context => {
  sendSetupStatusUpdate(context, statusSteps.testing)
}

const statusTestingPending = context => {
  let status = setStatusObj(
    context,
    statusSteps.testing,
    statusStates.pending
  )
  if (context.percentComplete) {
    status.description = labels[statusSteps.testing]
      .description[statusStates.pendingWithPercent]
      .replace(
        "%percent_complete%",
        context.percentComplete
      )
  }
  context.github.repos.createStatus(status)
}

const statusTestingFailure = context => {
  sendStatusUpdate(
    context,
    statusSteps.testing,
    statusStates.failure
  )
}

const statusTestingSuccess = context => {
  sendStatusUpdate(
    context,
    statusSteps.testing,
    statusStates.success
  )
}

const statusResultsSetup = context => {
  sendSetupStatusUpdate(context, statusSteps.results)
}

const statusResultsPending = context => {
  sendStatusUpdate(
    context,
    statusSteps.results,
    statusStates.pending
  )
}

const statusResultsFailure = context => {
  const { resultsMatrix } = context
  let hits = []
  Object.entries(resultsMatrix).forEach(entry => {
    const [name, value] = entry
    if (value) hits.push(`${value} ${name}`)
  })
  let status = setStatusObj(
    context,
    statusSteps.results,
    statusStates.failure
  )
  status.description = status.description.replace("%hits%", hits.join(', ') + ' severity')
  status.target_url = resultsUri.replace(':stlid', context.testId)
  context.github.repos.createStatus(status)
}

const statusResultsSuccess = (context) => {
  let status = setStatusObj(
    context,
    statusSteps.results,
    statusStates.success
  )
  status.description = status.description.replace(
    "%severity%",
    context.severityThreshold
  )
  status.target_url = resultsUri.replace(':stlid', context.testId)
  context.github.repos.createStatus(status)
}

const passesSeverity = (severity, min_severity) => {
  levels = ['low', 'medium', 'high']
  if (!levels.includes(severity)) return True
  severity = levels.indexOf(severity)
  min_severity = levels.indexOf(min_severity)
  return min_severity > severity
}

const cleanProjectName = (projectName) => {
  if (!projectName) return ''
  // projectName = projectName.replace(/\//g, '%2F')
  const delims = ["<", ">", "#", "%", '"']
  const reserved = [";", "?", ":", "@", "&", "=", "+", "$", ","]
  const unwise = ["{", "}", "|", "\\", "^", "[", "]", "`"]
  const forbidden = [
    ...delims,
    ...reserved,
    ...unwise,
  ]
  let cleanString = ''
  projectName.split('').map(a => a).forEach(a => {
    cleanString += !forbidden.includes(a) ? a : ''
  })
  cleanString = cleanString.replace(/\//g, '%2F')
  return cleanString
}

const destructureProjectName = (projectName) => {
  // @todo: Destructuring is not working here
  // const [ project, branch ] = projectName.split('/tree/')
  if (!projectName) return
  try {
    projectName = projectName.split('/tree/')
    const project = projectName[0]
    const branch = projectName[1]
    const owner = project.split('/')[0]
    const repo = project.split('/')[1]
    return [ owner, repo, branch ]
  }
  catch(e) { return projectName.split('/') }
}

const uriEncodeProjectName = (projectName) => encodeURIComponent(cleanProjectName(projectName))

const uriDecodeProjectName = (projectName) => projectName.replace(/%2F/g, '/')

module.exports = {
  cleanProjectName,
  destructureProjectName,
  getRepoInfo,
  passesSeverity,
  statusSetupPending,
  statusSetupFailure,
  statusSetupFailureRepoMismatch,
  statusSetupSuccess,
  statusUploadingSetup,
  statusUploadingPending,
  statusUploadingSuccess,
  statusUploadingFailure,
  statusTestingSetup,
  statusTestingPending,
  statusTestingFailure,
  statusTestingSuccess,
  statusResultsSetup,
  statusResultsPending,
  statusResultsFailure,
  statusResultsSuccess,
  resultsUri,
  uriDecodeProjectName,
  uriEncodeProjectName,
}