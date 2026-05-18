import 'dotenv/config'
import { buildServer } from './server'

const app = buildServer()

app.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
})
