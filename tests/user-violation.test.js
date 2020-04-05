jest.mock("redis", ()=>{
  return require("redis-mock");
});
const UserViolation = require("../src/components/user-violation-storage");

const testId = 123456;
const testName = "John Doe";

afterEach( async () => {
  await UserViolation.flush();
});

test("get expiration", async ()=>{
  let n = await UserViolation.getExpiration();
  expect(n).toBe(300);
});

test("register", async ()=>{
  await UserViolation.register(testId, testName);
  let n = await UserViolation.register(testId, testName);
  expect(n).toBe(2);
});

test("get number of violations", async () => {
  await UserViolation.register(testId, testName);
  let n = await UserViolation.getViolationData(testId);
  expect(n).toBe(1);
});

test("get incremented number of violations", async () => {
  let tn = 3;
  for (let i = 0; i < tn; i++) {
    await UserViolation.register(testId, testName);
  }
  let n = await UserViolation.getViolationData(testId);
  expect(n).toBe(tn);
});

test("flush", async () => {
  let tn = 3;
  for (let i = 0; i < tn; i++) {
    await UserViolation.register(testId, testName);
  }
  await UserViolation.flush();
  let n = await UserViolation.getViolationData(testId);
  expect(n).toBe(NaN);
});

test("remove userdata by ID", async () => {
  await UserViolation.register(testId, testName);
  await UserViolation.remove(testId);
  let n = await UserViolation.getViolationData(testId);
  expect(n).toBe(NaN);
});

test("remove userdata by username", async () => {
  await UserViolation.register(testId, testName);
  await UserViolation.remove(testName);
  let n = await UserViolation.getViolationData(testId);
  expect(n).toBe(NaN);
});

test("get userid by his name", async () => {
  await UserViolation.register(testId, testName);
  let n = await UserViolation.getUserIdByUsername(testName);
  expect(n).toBe(testId);
});

/** Returns data about all the violations registered */
// getAllViolations() {
//   return new Promise(function(resolve, reject) {
//     redis.keys(this.key_nViolation("*"), function (err, keys) {
//       if (err) {
//         reject(err);
//       } else {
//         resolve(keys);
//       }
//     });
//   });
// }

/** Returns data about all usernames registered */
// getAllUserNames() {
//   return new Promise(function(resolve, reject) {
//     redis.keys(this.key_username("*"), function (err, keys) {
//       if (err) {
//         reject(err);
//       } else {
//         resolve(keys);
//       }
//     });
//   });
// }

