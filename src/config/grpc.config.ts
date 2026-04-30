import { z } from 'zod';

export const grpcSchema = z.object({
  GRPC_HOST: z.string().default('0.0.0.0'),
  GRPC_PORT: z.coerce.number().int().min(1).max(65535).default(50051),
});
