import {
	registerDecorator,
	ValidationOptions,
	ValidationArguments,
} from 'class-validator';

export function IsValidDateOfBirth(
	opts: { minAge?: number; maxAge?: number } = {},
	validationOptions?: ValidationOptions,
) {
	const { minAge = 0, maxAge = 150 } = opts;

	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'isValidDateOfBirth',
			target: object.constructor,
			propertyName,
			constraints: [minAge, maxAge],
			options: validationOptions,
			validator: {
				validate(value: string) {
					if (typeof value !== 'string') return false;

					const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
					if (!match) return false;

					const [, yearStr, monthStr, dayStr] = match;
					const year = parseInt(yearStr, 10);
					const month = parseInt(monthStr, 10);
					const day = parseInt(dayStr, 10);

					const date = new Date(year, month - 1, day);

					if (
						date.getFullYear() !== year ||
						date.getMonth() !== month - 1 ||
						date.getDate() !== day
					) {
						return false;
					}

					if (date > new Date()) return false;

					const now = new Date();
					const age =
						now.getFullYear() -
						year -
						(now < new Date(year + minAge, month - 1, day) ? 1 : 0);

					if (age < minAge || age > maxAge) return false;

					return true;
				},

				defaultMessage(args: ValidationArguments) {
					const [min, max] = args.constraints;
					return `${args.property} must be a valid date and the person must be between ${min} and ${max} years old`;
				},
			},
		});
	};
}
