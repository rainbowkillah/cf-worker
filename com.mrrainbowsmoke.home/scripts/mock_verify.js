const http = require('http')
const port = process.env.PORT || 9000

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/verify') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      // For testing, always return a success verification result with admin claim
      const response = {
        verificationResult: 'Success',
        verifiableCredential: [
          {
            issuer: 'did:example:issuer',
            credentialSubject: {
              role: 'admin',
              name: 'Test Admin'
            }
          }
        ]
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(response))
    })
    return
  }
  res.writeHead(404)
  res.end('Not Found')
})

server.listen(port, () => console.log(`Mock verify server listening on http://localhost:${port}`))
