import { Tedis } from 'tedis'
import { Session, SessionStatus } from '#modules/session/session'
import { apiError, ErrorTypes } from '#modules/errors'

const host: string | undefined = process.env.REDIS_TLS_URL || process.env.REDIS_TLS_URL || process.env.SESSION_DB_URL
const port: number | undefined = Number(process.env.SESSION_DB_PORT)
const password: string | undefined = process.env.SESSION_DB_PASSWORD
const username: string | undefined = process.env.SESSION_DB_USERNAME
const tls: string | boolean = Boolean(process.env.SESSION_DB_TLS)

let sessionDB: Tedis | undefined

connectToDatabase()

/**
 * Saves a session to de DB
 * @param session the session to be saved
 */
export function saveSession(session: Session) : Promise<void>  {
	if(!sessionDB) return Promise.reject(new apiError('SessionDB offline', ErrorTypes.general))

	return sessionDB.hmset(session.access_token, session)
		.then((status) => {
			if(status === 'OK') return undefined
			else throw new apiError('Failed to create session', ErrorTypes.session)
		})
}

/**
 * Get a session from the dd rejects if no session can be found
 * @param accessToken the sessions access token
 * @returns the session belonging to this access token
 */
export function getSession(accessToken: Session['access_token']) : Promise<Session> {
	if(!sessionDB) return Promise.reject(new apiError('SessionDB offline', ErrorTypes.general))

	return sessionDB.exists(accessToken)
		.then((exists) => {
			if(!sessionDB) throw new apiError('SessionDB offline', ErrorTypes.general)
			else if(!exists) throw new apiError('Session does not exist', ErrorTypes.session)
			else return sessionDB.hgetall(accessToken)
		})
		.then(transformRawSession)
}

/**
 * Deletes the session from the db
 * @param accessToken the access token of the session to be deleted
 * @param expired whether it is an expiry or revocation
 */
export function deleteSession(accessToken: Session['access_token'], expired = false) : void {
	if(!sessionDB) throw new apiError('SessionDB offline', ErrorTypes.general)
	sessionDB.hset(accessToken, 'status', expired ? SessionStatus.expired : SessionStatus.revoked)
	sessionDB.expire(accessToken, 600)
}


function connectToDatabase() {
	console.info('Connecting to DB')
	if (typeof port === 'number' && !isNaN(port) && typeof host === 'string') {
		const options: {
			host: string;
			port: number;
			password?: string;
			username?: string;
			tls?: {key: Buffer, cert: Buffer};
		} = { host, port }
	
		if (Boolean(password) && typeof password === 'string') options.password = password
		if (Boolean(username) && typeof username === 'string') options.username = username
		if (tls) options.tls = { key: Buffer.from(''), cert: Buffer.from('')}
	
		sessionDB = new Tedis(options)

		let dbError: Error
	
		sessionDB.on('connect', () => console.log('SessionDB connected'))
		sessionDB.on('error', (error) => dbError = error)
		sessionDB.on('close', (had_error) => {
			console.log('SessionDB closed', dbError && had_error ? dbError : 'Normal Closure')

			sessionDB = undefined
			setTimeout(connectToDatabase, 300000)
		})
	}
}


function transformRawSession(rawSession: { [propName: string] :  string| number}) : Session {
	const status = (rawStatus: string | number) => {
		switch(rawStatus) {
		case SessionStatus.active:
			return SessionStatus.active
			break
		case SessionStatus.expired:
			return SessionStatus.expired
			break
		case SessionStatus.revoked:
			return SessionStatus.revoked
			break
		default:
			return SessionStatus.revoked
		}
	}
	
	
	return {
		status: status(rawSession.status),
		access_token: typeof rawSession.access_token === 'string' ? rawSession.access_token : String(rawSession.access_token),
		valid_from: typeof rawSession.valid_from === 'string' ? rawSession.valid_from : String(rawSession.valid_from),
		expires_in: typeof rawSession.expires_in === 'number' ? rawSession.expires_in : Number(rawSession.expires_in),
		expires_on: typeof rawSession.expires_on === 'string' ? rawSession.expires_on : String(rawSession.expires_on)
	}

}