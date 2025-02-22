import { Hono } from 'hono'

const PostApp = new Hono()
  .get('/', async (c) => {
    return c.json({ posts: [] }, 200)
  })
  .get('/:postId', async (c) => {
    return c.json({ post: {} }, 200)
  })

export default PostApp
