const { haversineDistance } = require("./distance");

const {
  DEFAULT_COST_PER_KM,
  calculateDeliveryCost
} = require("./cost");

const MAX_ITERATIONS = 100;
const CONVERGENCE_THRESHOLD_KM = 0.001;


function validateInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Input must be an object.");
  }

  if (
    !Array.isArray(input.neighborhoods) ||
    input.neighborhoods.length === 0
  ) {
    throw new Error(
      "neighborhoods must be a non-empty array."
    );
  }

  if (
    !Number.isInteger(input.warehouse_count) ||
    input.warehouse_count < 1
  ) {
    throw new Error(
      "warehouse_count must be a positive integer."
    );
  }

  if (
    input.warehouse_count >
    input.neighborhoods.length
  ) {
    throw new Error(
      "warehouse_count cannot exceed the number of neighborhoods."
    );
  }

  if (
    !Number.isFinite(input.warehouse_capacity) ||
    input.warehouse_capacity < 0
  ) {
    throw new Error(
      "warehouse_capacity must be a non-negative number."
    );
  }

  if (
    !Number.isFinite(input.max_service_radius_km) ||
    input.max_service_radius_km < 0
  ) {
    throw new Error(
      "max_service_radius_km must be a non-negative number."
    );
  }

  for (const neighborhood of input.neighborhoods) {
    if (!neighborhood.id || !neighborhood.name) {
      throw new Error(
        "Each neighborhood needs id and name."
      );
    }

    if (
      !Number.isFinite(neighborhood.latitude) ||
      !Number.isFinite(neighborhood.longitude) ||
      !Number.isFinite(neighborhood.daily_orders)
    ) {
      throw new Error(
        `Invalid numeric data for ${neighborhood.id}.`
      );
    }

    if (
      neighborhood.latitude < -90 ||
      neighborhood.latitude > 90 ||
      neighborhood.longitude < -180 ||
      neighborhood.longitude > 180
    ) {
      throw new Error(
        `Invalid coordinates for ${neighborhood.id}.`
      );
    }

    if (neighborhood.daily_orders < 0) {
      throw new Error(
        `daily_orders cannot be negative for ${neighborhood.id}.`
      );
    }
  }

  if (
    input.cost_per_km !== undefined &&
    (
      !Number.isFinite(input.cost_per_km) ||
      input.cost_per_km < 0
    )
  ) {
    throw new Error(
      "cost_per_km must be a non-negative number when provided."
    );
  }
}


/*
  Calculates the weighted geographical center
  of a group of neighborhoods.

  daily_orders = weight
*/
function calculateWeightedCenter(
  neighborhoods,
  fallback
) {
  let totalWeight = 0;
  let weightedLatitude = 0;
  let weightedLongitude = 0;

  for (const neighborhood of neighborhoods) {
    const weight = neighborhood.daily_orders;

    totalWeight += weight;

    weightedLatitude +=
      neighborhood.latitude * weight;

    weightedLongitude +=
      neighborhood.longitude * weight;
  }

  /*
    If all neighborhoods have zero orders,
    use their normal geographic center instead.
  */
  if (totalWeight === 0) {
    if (fallback) {
      return fallback;
    }

    return {
      latitude:
        neighborhoods.reduce(
          (sum, n) => sum + n.latitude,
          0
        ) / neighborhoods.length,

      longitude:
        neighborhoods.reduce(
          (sum, n) => sum + n.longitude,
          0
        ) / neighborhoods.length
    };
  }

  return {
    latitude:
      weightedLatitude / totalWeight,

    longitude:
      weightedLongitude / totalWeight
  };
}


/*
  Choose initial warehouse locations.

  First warehouse:
  highest-demand neighborhood.

  Remaining warehouses:
  choose points farthest from the
  already selected warehouses.
*/
function initializeWarehouses(
  neighborhoods,
  warehouseCount
) {
  const warehouses = [];

  const firstWarehouse =
    neighborhoods.reduce(
      (best, neighborhood) =>
        neighborhood.daily_orders >
        best.daily_orders
          ? neighborhood
          : best
    );

  warehouses.push({
    latitude: firstWarehouse.latitude,
    longitude: firstWarehouse.longitude
  });

  while (
    warehouses.length < warehouseCount
  ) {
    let selectedNeighborhood = null;
    let greatestMinimumDistance = -1;

    for (const neighborhood of neighborhoods) {
      let nearestDistance = Infinity;

      for (const warehouse of warehouses) {
        const distance =
          haversineDistance(
            neighborhood.latitude,
            neighborhood.longitude,
            warehouse.latitude,
            warehouse.longitude
          );

        nearestDistance =
          Math.min(
            nearestDistance,
            distance
          );
      }

      if (
        nearestDistance >
        greatestMinimumDistance
      ) {
        greatestMinimumDistance =
          nearestDistance;

        selectedNeighborhood =
          neighborhood;
      }
    }

    warehouses.push({
      latitude:
        selectedNeighborhood.latitude,

      longitude:
        selectedNeighborhood.longitude
    });
  }

  return warehouses;
}


/*
  Assign every neighborhood to its
  nearest warehouse.
*/
function assignNeighborhoods(
  neighborhoods,
  warehouses
) {
  return neighborhoods.map(
    neighborhood => {
      let nearestWarehouseIndex = 0;
      let shortestDistance = Infinity;

      warehouses.forEach(
        (warehouse, index) => {
          const distance =
            haversineDistance(
              neighborhood.latitude,
              neighborhood.longitude,
              warehouse.latitude,
              warehouse.longitude
            );

          if (
            distance < shortestDistance
          ) {
            shortestDistance = distance;
            nearestWarehouseIndex = index;
          }
        }
      );

      return {
        neighborhood,
        warehouseIndex:
          nearestWarehouseIndex,
        distanceKm:
          shortestDistance
      };
    }
  );
}


/*
  Move each warehouse toward the
  weighted center of its assigned
  neighborhoods.
*/
function recalculateWarehouses(
  neighborhoods,
  assignments,
  warehouseCount
) {
  const newWarehouses = [];

  for (
    let warehouseIndex = 0;
    warehouseIndex < warehouseCount;
    warehouseIndex++
  ) {
    const assignedNeighborhoods =
      assignments
        .filter(
          assignment =>
            assignment.warehouseIndex ===
            warehouseIndex
        )
        .map(
          assignment =>
            assignment.neighborhood
        );

    if (
      assignedNeighborhoods.length === 0
    ) {
      newWarehouses.push(null);
      continue;
    }

    newWarehouses.push(
      calculateWeightedCenter(
        assignedNeighborhoods
      )
    );
  }

  return newWarehouses;
}


/*
  Check how much all warehouses moved.
*/
function calculateWarehouseMovement(
  oldWarehouses,
  newWarehouses
) {
  let totalMovement = 0;

  for (
    let i = 0;
    i < oldWarehouses.length;
    i++
  ) {
    if (!newWarehouses[i]) {
      continue;
    }

    totalMovement +=
      haversineDistance(
        oldWarehouses[i].latitude,
        oldWarehouses[i].longitude,
        newWarehouses[i].latitude,
        newWarehouses[i].longitude
      );
  }

  return totalMovement;
}


/*
  Weighted K-means-style optimization.
*/
function runWeightedKMeans(
  neighborhoods,
  warehouseCount,
  maxIterations = MAX_ITERATIONS,
  convergenceThresholdKm =
    CONVERGENCE_THRESHOLD_KM
) {
  let warehouses =
    initializeWarehouses(
      neighborhoods,
      warehouseCount
    );

  let assignments = [];
  let iterations = 0;

  for (
    ;
    iterations < maxIterations;
    iterations++
  ) {
    /*
      Assign neighborhoods.
    */
    assignments =
      assignNeighborhoods(
        neighborhoods,
        warehouses
      );

    /*
      Recalculate warehouse positions.
    */
    const calculatedWarehouses =
      recalculateWarehouses(
        neighborhoods,
        assignments,
        warehouseCount
      );

    const newWarehouses =
      calculatedWarehouses.map(
        (newWarehouse, index) => {
          if (!newWarehouse) {
            return warehouses[index];
          }

          return newWarehouse;
        }
      );

    /*
      Measure movement.
    */
    const movement =
      calculateWarehouseMovement(
        warehouses,
        newWarehouses
      );

    warehouses =
      newWarehouses;

    /*
      Stop when movement becomes tiny.
    */
    if (
      movement <=
      convergenceThresholdKm
    ) {
      iterations++;
      break;
    }
  }

  /*
    Final assignment using final
    warehouse locations.
  */
  assignments =
    assignNeighborhoods(
      neighborhoods,
      warehouses
    );

  return {
    warehouses,
    assignments,
    iterations
  };
}


/*
  Convert internal assignments
  into the output format.
*/
function buildAssignments(
  assignments,
  maxServiceRadiusKm,
  costPerKm
) {
  return assignments.map(
    assignment => {
      const neighborhood =
        assignment.neighborhood;

      const distanceKm =
        assignment.distanceKm;

      const weightedDistance =
        distanceKm *
        neighborhood.daily_orders;

      const deliveryCost =
        calculateDeliveryCost(
          distanceKm,
          neighborhood.daily_orders,
          costPerKm
        );

      return {
        neighborhood_id:
          neighborhood.id,

        warehouse_id:
          `W${assignment.warehouseIndex + 1}`,

        distance_km:
          round(distanceKm, 3),

        daily_orders:
          neighborhood.daily_orders,

        delivery_cost:
          round(deliveryCost, 2),

        service_radius_ok:
          distanceKm <=
          maxServiceRadiusKm,

        weighted_distance:
          round(
            weightedDistance,
            3
          )
      };
    }
  );
}


/*
  Build warehouse information.
*/
function buildWarehouses(
  warehouses,
  assignments,
  capacity,
  maxServiceRadiusKm
) {
  return warehouses.map(
    (warehouse, index) => {
      const assigned =
        assignments.filter(
          assignment =>
            assignment.warehouseIndex ===
            index
        );

      const totalDailyOrders =
        assigned.reduce(
          (sum, assignment) =>
            sum +
            assignment.neighborhood.daily_orders,
          0
        );

      const utilization =
        capacity === 0
          ? totalDailyOrders > 0
            ? Infinity
            : 0
          : (
              totalDailyOrders /
              capacity
            ) * 100;

      return {
        id:
          `W${index + 1}`,

        name:
          `Warehouse ${index + 1}`,

        latitude:
          round(
            warehouse.latitude,
            6
          ),

        longitude:
          round(
            warehouse.longitude,
            6
          ),

        assigned_neighborhoods:
          assigned.map(
            assignment =>
              assignment.neighborhood.id
          ),

        total_daily_orders:
          totalDailyOrders,

        capacity,

        utilization_percent:
          Number.isFinite(utilization)
            ? round(utilization, 2)
            : null,

        overloaded:
          totalDailyOrders > capacity,

        max_service_radius_km:
          maxServiceRadiusKm
      };
    }
  );
}


/*
  Calculate metrics for an arrangement.
*/
function calculateArrangementMetrics(
  assignments,
  costPerKm
) {
  let totalDistanceKm = 0;
  let totalWeightedDeliveryCost = 0;

  for (const assignment of assignments) {
    const distanceKm =
      assignment.distanceKm;

    const dailyOrders =
      assignment.neighborhood.daily_orders;

    totalDistanceKm +=
      distanceKm;

    totalWeightedDeliveryCost +=
      calculateDeliveryCost(
        distanceKm,
        dailyOrders,
        costPerKm
      );
  }

  return {
    total_delivery_distance_km:
      round(totalDistanceKm, 3),

    weighted_delivery_cost:
      round(
        totalWeightedDeliveryCost,
        2
      )
  };
}


/*
  Build the ORIGINAL arrangement.

  There are no existing warehouse
  coordinates in the input.

  Therefore we use the first K
  neighborhoods as a deterministic
  baseline.
*/
function buildOriginalArrangement(
  neighborhoods,
  warehouseCount,
  maxServiceRadiusKm,
  costPerKm,
  capacity
) {
  const originalWarehouses =
    neighborhoods
      .slice(0, warehouseCount)
      .map(
        neighborhood => ({
          latitude:
            neighborhood.latitude,

          longitude:
            neighborhood.longitude
        })
      );

  const assignments =
    assignNeighborhoods(
      neighborhoods,
      originalWarehouses
    );

  const metrics =
    calculateArrangementMetrics(
      assignments,
      costPerKm
    );

  return {
    total_delivery_distance_km:
      metrics.total_delivery_distance_km,

    weighted_delivery_cost:
      metrics.weighted_delivery_cost
  };
}


function round(
  value,
  decimals
) {
  const factor =
    10 ** decimals;

  return Math.round(
    value * factor
  ) / factor;
}


/*
  PUBLIC FUNCTION.

  Person 3 imports ONLY this.
*/
function optimizeWarehouses(
  input
) {
  const startTime =
    Date.now();

  validateInput(input);

  const costPerKm =
    input.cost_per_km ??
    DEFAULT_COST_PER_KM;

  const neighborhoods =
    input.neighborhoods;

  const warehouseCount =
    input.warehouse_count;

  const capacity =
    input.warehouse_capacity;

  const maxServiceRadiusKm =
    input.max_service_radius_km;


  /*
    ORIGINAL
  */
  const original =
    buildOriginalArrangement(
      neighborhoods,
      warehouseCount,
      maxServiceRadiusKm,
      costPerKm,
      capacity
    );


  /*
    OPTIMIZATION
  */
  const optimization =
    runWeightedKMeans(
      neighborhoods,
      warehouseCount
    );


  /*
    OPTIMIZED ASSIGNMENTS
  */
  const optimizedAssignments =
    buildAssignments(
      optimization.assignments,
      maxServiceRadiusKm,
      costPerKm
    );


  /*
    OPTIMIZED METRICS
  */
  const optimizedMetrics =
    calculateArrangementMetrics(
      optimization.assignments,
      costPerKm
    );


  /*
    OPTIMIZED WAREHOUSES
  */
  const optimizedWarehouses =
    buildWarehouses(
      optimization.warehouses,
      optimization.assignments,
      capacity,
      maxServiceRadiusKm
    );


  /*
    COMPARISON
  */
  const distanceReduction =
    original.total_delivery_distance_km -
    optimizedMetrics.total_delivery_distance_km;

  const costReduction =
    original.weighted_delivery_cost -
    optimizedMetrics.weighted_delivery_cost;

  const distanceReductionPercent =
    original.total_delivery_distance_km > 0
      ? (
          distanceReduction /
          original.total_delivery_distance_km
        ) * 100
      : 0;

  const costReductionPercent =
    original.weighted_delivery_cost > 0
      ? (
          costReduction /
          original.weighted_delivery_cost
        ) * 100
      : 0;


  /*
    SUMMARY
  */
  const totalDailyOrders =
    neighborhoods.reduce(
      (sum, neighborhood) =>
        sum +
        neighborhood.daily_orders,
      0
    );

  const overloadedWarehouses =
    optimizedWarehouses.filter(
      warehouse =>
        warehouse.overloaded
    ).length;

  const radiusViolations =
    optimizedAssignments.filter(
      assignment =>
        !assignment.service_radius_ok
    ).length;


  return {
    status: "success",

    warehouses:
      optimizedWarehouses,

    assignments:
      optimizedAssignments,

    original: {
      total_delivery_distance_km:
        original.total_delivery_distance_km,

      weighted_delivery_cost:
        original.weighted_delivery_cost
    },

    optimized: {
      total_delivery_distance_km:
        optimizedMetrics.total_delivery_distance_km,

      weighted_delivery_cost:
        optimizedMetrics.weighted_delivery_cost
    },

    comparison: {
      distance_reduction_km:
        round(
          distanceReduction,
          3
        ),

      distance_reduction_percent:
        round(
          distanceReductionPercent,
          2
        ),

      cost_reduction:
        round(
          costReduction,
          2
        ),

      cost_reduction_percent:
        round(
          costReductionPercent,
          2
        )
    },

    summary: {
      total_daily_orders:
        totalDailyOrders,

      warehouse_count:
        warehouseCount,

      overloaded_warehouses:
        overloadedWarehouses,

      radius_violations:
        radiusViolations,

      optimization_iterations:
        optimization.iterations,

      optimization_time_ms:
        Date.now() - startTime,

      cost_per_km:
        costPerKm
    }
  };
}


module.exports = {
  optimizeWarehouses
};