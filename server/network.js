import { lookup as dnsLookup } from "node:dns";
import { BlockList, isIP } from "node:net";

// Keep server-side requests away from internal or reserved networks.
const privateRanges = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) privateRanges.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
]) privateRanges.addSubnet(net, prefix, "ipv6");

export function isPrivateAddress(address) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) address = mapped[1];
  const family = isIP(address);
  if (!family) return true;
  return privateRanges.check(address, family === 4 ? "ipv4" : "ipv6");
}

// A dns.lookup replacement that refuses hostnames resolving to private addresses.
export function safeLookup(hostname, options, callback) {
  if (typeof options === "function") [callback, options] = [options, {}];
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
      return callback(Object.assign(new Error(`Refusing to connect to ${hostname}`), { code: "EPRIVATE" }));
    }
    if (options?.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

export function resolvesPublicly(hostname) {
  return new Promise((resolve) => safeLookup(hostname, {}, (error) => resolve(!error)));
}
