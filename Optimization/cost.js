const DEFAULT_COST_PER_KM = 1.0;

function calculateDeliveryCost(
  distanceKm,
  dailyOrders,
  costPerKm = DEFAULT_COST_PER_KM
) {
  return distanceKm * dailyOrders * costPerKm;
}

module.exports = {
  DEFAULT_COST_PER_KM,
  calculateDeliveryCost
};