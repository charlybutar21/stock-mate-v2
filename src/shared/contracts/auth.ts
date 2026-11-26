import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .max(254, 'Email must be at most 254 characters')
  .toLowerCase()
  .pipe(z.email('Must be a valid email address'));

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least 1 letter')
  .regex(/\d/, 'Password must contain at least 1 digit');

export const registerRequestSchema = z.object({
  email: emailSchema,
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(80, 'Name must be at most 80 characters'),
  password: passwordSchema,
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export interface AuthUserDto {
  id: string;
  email: string;
  name: string;
}
