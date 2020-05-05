"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prism_http_1 = require("@stoplight/prism-http");
const pipeable_1 = require("fp-ts/lib/pipeable");
const E = require("fp-ts/lib/Either");
const t = require("io-ts");
const PathReporter_1 = require("io-ts/lib/PathReporter");
const BooleanFromString_1 = require("io-ts-types/lib/BooleanFromString");
const parsePreferHeader = require("parse-prefer-header");
const PreferencesDecoder = t.union([
    t.undefined,
    t.partial({
        code: t.string,
        dynamic: t.string.pipe(BooleanFromString_1.BooleanFromString),
        example: t.string,
    }, 'Preferences'),
]);
exports.getHttpConfigFromRequest = (req) => {
    var _a, _b, _c;
    const preferences = req.headers && req.headers['prefer']
        ? parsePreferHeader(req.headers['prefer'])
        : { code: (_a = req.url.query) === null || _a === void 0 ? void 0 : _a.__code, dynamic: (_b = req.url.query) === null || _b === void 0 ? void 0 : _b.__dynamic, example: (_c = req.url.query) === null || _c === void 0 ? void 0 : _c.__example };
    return pipeable_1.pipe(PreferencesDecoder.decode(preferences), E.bimap(err => prism_http_1.ProblemJsonError.fromTemplate(prism_http_1.UNPROCESSABLE_ENTITY, PathReporter_1.failure(err).join('; ')), parsed => ({ code: parsed === null || parsed === void 0 ? void 0 : parsed.code, exampleKey: parsed === null || parsed === void 0 ? void 0 : parsed.example, dynamic: parsed === null || parsed === void 0 ? void 0 : parsed.dynamic })));
};
