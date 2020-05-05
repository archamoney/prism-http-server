"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fast_xml_parser_1 = require("fast-xml-parser");
const typeIs = require("type-is");
const xmlSerializer = new fast_xml_parser_1.j2xParser({});
const serializers = [
    {
        test: (value) => !!typeIs.is(value, ['application/json', 'application/*+json']),
        serializer: JSON.stringify,
    },
    {
        test: (value) => !!typeIs.is(value, ['application/xml', 'application/*+xml']),
        serializer: (data) => (typeof data === 'string' ? data : xmlSerializer.parse({ xml: data })),
    },
    {
        test: (value) => !!typeIs.is(value, ['text/*']),
        serializer: (data) => {
            if (['string', 'undefined'].includes(typeof data)) {
                return data;
            }
            throw Object.assign(new Error('Cannot serialise complex objects as text'), {
                detail: 'Cannot serialise complex objects as text',
                status: 500,
                name: 'https://stoplight.io/prism/errors#NO_COMPLEX_OBJECT_TEXT',
            });
        },
    },
];
exports.serialize = (payload, contentType) => {
    if (!contentType && !payload) {
        return;
    }
    const serializer = contentType ? serializers.find(s => s.test(contentType)) : undefined;
    if (!serializer) {
        if (typeof payload === 'string')
            return payload;
        throw new Error(`Cannot find serializer for ${contentType}`);
    }
    return serializer.serializer(payload);
};
