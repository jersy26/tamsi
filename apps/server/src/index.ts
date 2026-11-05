// One Railway service: this process serves the API and the built web app.
import express from 'express'

const app = express()

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, node: process.version })
})

const port = Number(process.env.PORT) || 3000
app.listen(port, () => {
  console.log(`Tamsi server listening on :${port} (Node ${process.version})`)
})
