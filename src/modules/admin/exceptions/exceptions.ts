export class DatabaseOperationException extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DatabaseOperationException';
	}
}
