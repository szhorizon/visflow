/**
 * @fileoverview Range filter options.
 */

/**
 * @param {!Object} params
 * @extends {visflow.options.Node}
 * @constructor
 */
visflow.options.RangeFilter = function(params) {
  visflow.options.RangeFilter.base.constructor.call(this, params);

  /**
   * Filtering dimensions.
   * @type {!Array<number>}
   */
  this.dims = params.dims !== undefined ? params.dims : [];

  /**
   * Filtering range values specified by directly typing in the input boxes.
   * Type-in values are stored as strings.
   */
  this.typeInValue = params.typeInValue !== undefined ? params.typeInValue : [];
};

_.inherit(visflow.options.RangeFilter, visflow.options.Node);
