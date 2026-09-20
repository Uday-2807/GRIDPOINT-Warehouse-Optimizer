const {
  optimizeWarehouses
} = require("./optimizer");

const {
  sampleInput
} = require("./sampleData");


function runTest(
  testName,
  input
) {
  console.log(
    `\n========== ${testName} ==========`
  );

  const result =
    optimizeWarehouses(input);

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/*
  TEST 1
  Normal optimization
*/
const normalResult =
  runTest(
    "TEST 1 - Normal Optimization",
    sampleInput
  );


/*
  TEST 2
  Multiple warehouses
*/
runTest(
  "TEST 2 - Two Warehouses",
  {
    ...sampleInput,
    warehouse_count: 2
  }
);


/*
  TEST 3
  Capacity overload
*/
const overloadResult =
  runTest(
    "TEST 3 - Capacity Overload",
    {
      ...sampleInput,

      warehouse_count: 2,

      warehouse_capacity: 2000
    }
  );

console.log(
  "Overloaded warehouses:",
  overloadResult.summary
    .overloaded_warehouses
);


/*
  TEST 4
  Service radius violation
*/
const radiusResult =
  runTest(
    "TEST 4 - Service Radius",
    {
      ...sampleInput,

      max_service_radius_km: 1
    }
  );

console.log(
  "Radius violations:",
  radiusResult.summary
    .radius_violations
);


/*
  TEST 5
  Different demand weights

  Make Electronic City extremely
  high demand and see whether the
  optimized warehouse moves toward it.
*/
const weightedInput = {
  ...sampleInput,

  warehouse_count: 2,

  neighborhoods:
    sampleInput.neighborhoods.map(
      neighborhood => ({
        ...neighborhood
      })
    )
};

weightedInput
  .neighborhoods[6]
  .daily_orders = 20000;


const weightedResult =
  runTest(
    "TEST 5 - High Demand Weight",
    weightedInput
  );

console.log(
  "High-demand neighborhood:",
  weightedInput.neighborhoods[6]
);

console.log(
  "Optimized warehouses:",
  weightedResult.warehouses
);


/*
  BASIC ASSERTIONS
*/
console.log(
  "\n========== BASIC TESTS =========="
);

console.log(
  "Normal status:",
  normalResult.status === "success"
    ? "PASS"
    : "FAIL"
);

console.log(
  "All neighborhoods assigned:",
  normalResult.assignments.length ===
  sampleInput.neighborhoods.length
    ? "PASS"
    : "FAIL"
);

console.log(
  "Overload detected:",
  overloadResult.summary
    .overloaded_warehouses > 0
    ? "PASS"
    : "FAIL"
);

console.log(
  "Radius violation detected:",
  radiusResult.summary
    .radius_violations > 0
    ? "PASS"
    : "FAIL"
);

console.log(
  "Weighted test completed:",
  weightedResult.status === "success"
    ? "PASS"
    : "FAIL"
);