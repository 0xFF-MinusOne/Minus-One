import {handle} from 'hono/vercel';
import {gateway} from '../../apps/api/main';
export default handle(gateway);
