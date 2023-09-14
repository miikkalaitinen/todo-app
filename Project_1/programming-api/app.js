import * as programmingAssignmentService from './services/programmingAssignmentService.js'
import * as gradingQueueService from './services/gradingQueueService.js'
import { serve } from './deps.js'

export let sockets = new Set()

const handlePost = async (request) => {
  try {
    const { code, assignment_id } = await request.json()
    const userId = request.headers.get('X-User-Id')

    const matchingSubmission =
      await programmingAssignmentService.findMatchingSubmission(
        assignment_id,
        userId,
        code
      )
    if (matchingSubmission) {
      return new Response(JSON.stringify(matchingSubmission), { status: 200 })
    }

    if (gradingQueueService.user_queue.has(userId)) {
      return new Response('Already in queue', { status: 200 })
    }

    const submission = await programmingAssignmentService.insertNewSubmission(
      userId,
      code,
      assignment_id
    )

    gradingQueueService.sendToQueue(submission)
    return Response.json(submission)
  } catch (e) {
    console.log(e)
    return new Response(e, { status: 500 })
  }
}

const handleStatus = async (request, urlPatternResult) => {
  const id = urlPatternResult.pathname.groups.id
  const { socket, response } = Deno.upgradeWebSocket(request)

  sockets.add({ socket, id })

  socket.onclose = () => {
    sockets.delete({ socket, id })
  }

  return response
}

const handleGetFirstUndone = async (request) => {
  try {
    const userId = await request.headers.get('X-User-Id')
    const assignment = await programmingAssignmentService.getFirstUndone(userId)
    if (!assignment) {
      return new Response('No undone assignments', { status: 404 })
    }
    return new Response(JSON.stringify(assignment), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.log(error)
    return new Response(error, { status: 500 })
  }
}

const urlMapping = [
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/assignments/undone' }),
    fn: handleGetFirstUndone,
  },
  {
    method: 'GET',
    pattern: new URLPattern({ pathname: '/assignments/status/:id' }),
    fn: handleStatus,
  },
  {
    method: 'POST',
    pattern: new URLPattern({ pathname: '/assignments/submit' }),
    fn: handlePost,
  },
]

const handleRequest = async (request) => {
  const mapping = urlMapping.find(
    (um) => um.method === request.method && um.pattern.test(request.url)
  )

  if (!mapping) {
    console.log('Not found')
    return new Response('Not found', { status: 404 })
  }

  const mappingResult = mapping.pattern.exec(request.url)
  return await mapping.fn(request, mappingResult)
}

const portConfig = { port: 7777, hostname: '0.0.0.0' }
serve(handleRequest, portConfig)
