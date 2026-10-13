// expo installs fetch (and its friends) as lazy globals. Jest's environment teardown reads every
// global, which loaded expo's fetch module after the tests had ended and logged "Cannot log after
// tests are done", failing the run at random. Reading it here loads it while the tests can log.
void globalThis.fetch;
