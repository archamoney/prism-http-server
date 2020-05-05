import { IHttpOperationConfig, IHttpRequest } from '@stoplight/prism-http';
import * as E from 'fp-ts/lib/Either';
export declare const getHttpConfigFromRequest: (req: IHttpRequest) => E.Either<Error, Partial<Pick<IHttpOperationConfig, "code" | "mediaTypes" | "exampleKey" | "dynamic">>>;
