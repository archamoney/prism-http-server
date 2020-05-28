"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prism_http_1 = require("@stoplight/prism-http");
const types_1 = require("@stoplight/types");
const micri_1 = require("micri");
const typeIs = require("type-is");
const getHttpConfigFromRequest_1 = require("./getHttpConfigFromRequest");
const serialize_1 = require("./serialize");
const fp_1 = require("lodash/fp");
const pipeable_1 = require("fp-ts/lib/pipeable");
const TE = require("fp-ts/lib/TaskEither");
const E = require("fp-ts/lib/Either");
function searchParamsToNameValues(searchParams) {
    const params = {};
    for (const key of searchParams.keys()) {
        const values = searchParams.getAll(key);
        params[key] = values.length === 1 ? values[0] : values;
    }
    return params;
}
function addressInfoToString(addressInfo) {
    if (!addressInfo)
        return '';
    if (typeof addressInfo === 'string')
        return addressInfo;
    return `http://${addressInfo.address}:${addressInfo.port}`;
}
function parseRequestBody(request) {
    if (request.headers['content-length'] === '0' || (
            request.headers['content-type'] === undefined &&
            request.headers['transfer-encoding'] === undefined &&
            (request.headers['content-length'] === '0' || request.headers['content-length'] === undefined))
        ) {
        return Promise.resolve(null);
    }
    if (typeIs(request, ['application/json', 'application/*+json'])) {
        return micri_1.json(request);
    }
    else {
        return micri_1.text(request);
    }
}
exports.createServer = (operations, opts) => {
    const { components, config } = opts;
    const handler = async (request, reply) => {
        const { url, method, headers } = request;
        const body = await parseRequestBody(request);
        const { searchParams, pathname } = new URL(url, 'http://example.com');
        const input = {
            method: (method ? method.toLowerCase() : 'get'),
            url: {
                path: pathname,
                baseUrl: searchParams.get('__server') || undefined,
                query: searchParamsToNameValues(searchParams),
            },
            headers: headers,
            body,
        };
        components.logger.info({ input }, 'Request received');
        const mockConfig = opts.config.mock === false
            ? TE.right(false)
            : pipeable_1.pipe(getHttpConfigFromRequest_1.getHttpConfigFromRequest(input), E.map(operationSpecificConfig => fp_1.merge(opts.config.mock, operationSpecificConfig)), TE.fromEither);
        pipeable_1.pipe(mockConfig, TE.chain(mockConfig => prism.request(input, operations, { ...opts.config, mock: mockConfig })), TE.chain(response => {
            const { output } = response;
            const inputValidationErrors = response.validations.input.map(createErrorObjectWithPrefix('request'));
            const outputValidationErrors = response.validations.output.map(createErrorObjectWithPrefix('response'));
            const inputOutputValidationErrors = inputValidationErrors.concat(outputValidationErrors);
            if (inputOutputValidationErrors.length > 0) {
                reply.setHeader('sl-violations', JSON.stringify(inputOutputValidationErrors));
                const errorViolations = outputValidationErrors.filter(v => v.severity === types_1.DiagnosticSeverity[types_1.DiagnosticSeverity.Error]);
                if (opts.config.errors && errorViolations.length > 0) {
                    return TE.left(prism_http_1.ProblemJsonError.fromTemplate(prism_http_1.VIOLATIONS, 'Your request/response is not valid and the --errors flag is set, so Prism is generating this error for you.', { validation: errorViolations }));
                }
            }
            inputOutputValidationErrors.forEach(validation => {
                const message = `Violation: ${validation.location.join('.') || ''} ${validation.message}`;
                if (validation.severity === types_1.DiagnosticSeverity[types_1.DiagnosticSeverity.Error]) {
                    components.logger.error({ name: 'VALIDATOR' }, message);
                }
                else if (validation.severity === types_1.DiagnosticSeverity[types_1.DiagnosticSeverity.Warning]) {
                    components.logger.warn({ name: 'VALIDATOR' }, message);
                }
                else {
                    components.logger.info({ name: 'VALIDATOR' }, message);
                }
            });
            return TE.fromIOEither(() => E.tryCatch(() => {
                if (output.headers)
                    Object.entries(output.headers).forEach(([name, value]) => reply.setHeader(name, value));
                micri_1.send(reply, output.statusCode, serialize_1.serialize(output.body, reply.getHeader('content-type')));
            }, E.toError));
        }), TE.mapLeft((e) => {
            if (!reply.finished) {
                reply.setHeader('content-type', 'application/problem+json');
                if (e.additional && e.additional.headers)
                    Object.entries(e.additional.headers).forEach(([name, value]) => reply.setHeader(name, value));
                micri_1.send(reply, e.status || 500, JSON.stringify(prism_http_1.ProblemJsonError.fromPlainError(e)));
            }
            else {
                reply.end();
            }
            components.logger.error({ input }, `Request terminated with error: ${e}`);
        }))();
    };
    function setCommonCORSHeaders(incomingHeaders, res) {
        res.setHeader('Access-Control-Allow-Origin', incomingHeaders['origin'] || '*');
        res.setHeader('Access-Control-Allow-Headers', incomingHeaders['access-control-request-headers'] || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Expose-Headers', incomingHeaders['access-control-expose-headers'] || '*');
    }
    const server = micri_1.default(micri_1.Router.router(micri_1.Router.on.options(() => opts.cors, (req, res) => {
        setCommonCORSHeaders(req.headers, res);
        if (!!req.headers['origin'] && !!req.headers['access-control-request-method']) {
            res.setHeader('Access-Control-Allow-Methods', req.headers['access-control-request-method'] || 'GET,DELETE,HEAD,PATCH,POST,PUT,OPTIONS');
            res.setHeader('Vary', 'origin');
            res.setHeader('Content-Length', '0');
            return micri_1.send(res, 204);
        }
        return handler(req, res);
    }), micri_1.Router.otherwise((req, res, options) => {
        if (opts.cors)
            setCommonCORSHeaders(req.headers, res);
        return handler(req, res, options);
    })));
    const prism = prism_http_1.createInstance(config, components);
    return {
        get prism() {
            return prism;
        },
        get logger() {
            return components.logger;
        },
        close() {
            return new Promise((resolve, reject) => server.close(error => {
                if (error) {
                    reject(error);
                }
                resolve();
            }));
        },
        listen: (port, ...args) => new Promise((resolve, reject) => {
            server.once('error', e => reject(e.message));
            server.listen(port, ...args, (err) => {
                if (err)
                    return reject(err);
                return resolve(addressInfoToString(server.address()));
            });
        }),
    };
};
const createErrorObjectWithPrefix = (locationPrefix) => (detail) => ({
    location: [locationPrefix].concat(detail.path || []),
    severity: types_1.DiagnosticSeverity[detail.severity],
    code: detail.code,
    message: detail.message,
});
