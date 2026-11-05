import {gateway} from './main';
export default {fetch:gateway.fetch,hostname:process.env.API_HOST||'127.0.0.1',port:Number(process.env.API_PORT||8788)};
