/**
 * @fileoverview Detect classnames which do not belong to Tailwind CSS
 * @author no-custom-classname
 */
'use strict';

const docsUrl = require('../util/docsUrl');
const defaultGroups = require('../config/groups').groups;
const customConfig = require('../util/customConfig');
const astUtil = require('../util/ast');
const attrUtil = require('../util/attr');
const groupUtil = require('../util/groupMethods');
const getOption = require('../util/settings');
const parserUtil = require('../util/parser');
const getClassnamesFromCSS = require('../util/cssFiles');

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

// Predefine message for use in context.report conditional.
// messageId will still be usable in tests.
const CUSTOM_CLASSNAME_DETECTED_MSG = `Classname '{{classname}}' is not a Tailwind CSS class!`;

module.exports = {
  meta: {
    docs: {
      description: 'Detect classnames which do not belong to Tailwind CSS',
      category: 'Best Practices',
      recommended: false,
      url: docsUrl('no-custom-classname'),
    },
    messages: {
      customClassnameDetected: CUSTOM_CLASSNAME_DETECTED_MSG,
    },
    fixable: null,
    schema: [
      {
        type: 'object',
        properties: {
          callees: {
            type: 'array',
            items: { type: 'string', minLength: 0 },
            uniqueItems: true,
          },
          config: {
            default: 'tailwind.config.js',
            type: ['string', 'object'],
          },
          cssFiles: {
            type: 'array',
            items: { type: 'string', minLength: 0 },
            uniqueItems: true,
          },
          whitelist: {
            type: 'array',
            items: { type: 'string', minLength: 0 },
            uniqueItems: true,
          },
        },
      },
    ],
  },

  create: function (context) {
    const callees = getOption(context, 'callees');
    const twConfig = getOption(context, 'config');
    const cssFiles = getOption(context, 'cssFiles');
    const whitelist = getOption(context, 'whitelist');

    const mergedConfig = customConfig.resolve(twConfig);

    //----------------------------------------------------------------------
    // Helpers
    //----------------------------------------------------------------------

    /**
     * Parse the classnames and report found conflicts
     * @param {Array} classNames
     * @param {ASTNode} node
     */
    const parseForCustomClassNames = (classNames, node) => {
      classNames = attrUtil.sanitizeClassnames(classNames);
      // Init assets before sorting
      const groups = groupUtil.getGroups(defaultGroups, mergedConfig);
      const classnamesFromFiles = getClassnamesFromCSS(cssFiles);

      classNames.forEach((className) => {
        const idx = groupUtil.getGroupIndex(className, groups, mergedConfig.separator);
        if (idx >= 0) {
          return; // Lazier is faster... processing next className!
        }
        const whitelistIdx = groupUtil.getGroupIndex(className, whitelist, mergedConfig.separator);
        if (whitelistIdx >= 0) {
          return; // Lazier is faster... processing next className!
        }
        const fromFilesIdx = groupUtil.getGroupIndex(className, classnamesFromFiles, mergedConfig.separator);
        if (fromFilesIdx >= 0) {
          return; // Lazier is faster... processing next className!
        }
        // No match found
        context.report({
          node,
          messageId: 'customClassnameDetected',
          data: {
            classname: className,
          },
        });
      });
    };

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    const scriptVisitor = {
      JSXAttribute: function (node) {
        if (!astUtil.isValidJSXAttribute(node)) {
          return;
        }
        astUtil.parseNodeRecursive(node, null, parseForCustomClassNames);
      },
      CallExpression: function (node) {
        if (callees.findIndex((name) => node.callee.name === name) === -1) {
          return;
        }
        node.arguments.forEach((arg) => {
          astUtil.parseNodeRecursive(node, arg, parseForCustomClassNames);
        });
      },
    };

    const templateVisitor = {
      VAttribute: function (node) {
        if (!astUtil.isValidVueAttribute(node)) {
          return;
        }
        astUtil.parseNodeRecursive(node, null, parseForCustomClassNames);
      },
    };

    return parserUtil.defineTemplateBodyVisitor(context, templateVisitor, scriptVisitor);
  },
};
