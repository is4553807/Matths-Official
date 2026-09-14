"use strict";

// This is a unit DOM, not a browser session or a real account/credential.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const script = fs.readFileSync(path.join(__dirname, "..", "public", "js", "portal-register.js"), "utf8");

class Node {
  constructor(properties = {}) { Object.assign(this, { dataset: {}, hidden: false, disabled: false, required: false, value: "", checked: false, textContent: "", listeners: {}, children: [], attrs: {} }, properties); this.classes = new Set(); this.classList = { toggle: (key, enabled) => enabled ? this.classes.add(key) : this.classes.delete(key) }; }
  addEventListener(event, callback) { (this.listeners[event] ||= []).push(callback); }
  async dispatch(type) { const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; for (const callback of this.listeners[type] || []) await callback(event); return event; }
  setAttribute(key, value) { this.attrs[key] = value; }
  getAttribute(key) { return this.attrs[key] || null; }
  replaceChildren(...nodes) { this.children = nodes; }
  append(...nodes) { this.children.push(...nodes); }
  focus() { this.focused = true; }
  setCustomValidity(message) { this.invalidMessage = message; }
  get willValidate() { return !this.disabled && !this.stage?.disabled; }
  checkValidity() { return !this.willValidate || (!this.invalidMessage && (!this.required || (this.type === "checkbox" ? this.checked : Boolean(this.value)))); }
  reportValidity() { this.focus(); return this.checkValidity(); }
}

function fixture({ parent = false, locked = false, social = false } = {}) {
  const nodes = {}, controls = {};
  const root = new Node({ dataset: { accountType: parent ? "parent" : "academy", invitationLocked: String(locked) } });
  const form = new Node(); let submitted = 0;
  function node(key, properties) { return nodes[key] = new Node(properties); }
  for (const key of ["registration-next", "registration-back", "registration-submit", "registration-progress", "step-status", "flow-title", "registration-review", "invite-lookup", "invite-error", "invite-preview", "invite-name", "invite-email", "invite-expiry", "child-consent"]) node(key);
  if (parent && !locked) node("connect-later");
  function control(name, properties = {}) { return controls[name] = new Node({ name, ...properties }); }
  control("registrationFlow", { value: parent ? "parent" : "new" });
  control("inviteToken", { value: locked ? "unit-token" : "" });
  control("displayName", { value: "단위 테스트", required: true });
  control("email", { value: "fixture@qa.invalid", required: true });
  if (!social) {
    control("password", { value: "UnitFixture123", required: true });
    control("passwordConfirm", { value: "UnitFixture123", required: true });
  }
  control("termsAccepted", { type: "checkbox", checked: true, required: true });
  if (!locked) control("inviteLink");
  if (parent) { control("relationship"); control("linkConsent", { type: "checkbox" }); }
  else {
    for (const name of ["academyName", "branchName", "address", "contactPhone"]) control(name, { value: name === "contactPhone" ? "02-1234-5678" : "기관 테스트", required: name !== "branchName" });
    control("authorityConfirmed", { type: "checkbox", required: true, checked: true });
  }
  nodes["invite-name"].textContent = "초대 대상";
  nodes["invite-preview"].querySelector = selector => nodes[selector.slice(6, -1)];
  nodes["child-consent"].querySelectorAll = () => [controls.relationship, controls.linkConsent];
  const assignments = parent ? { account: ["displayName", "email", "password", "passwordConfirm", "termsAccepted"], child: ["inviteLink", "relationship", "linkConsent"] } : { account: ["displayName", "email", "password", "passwordConfirm"], institution: ["academyName", "branchName", "address", "contactPhone"], staff: ["inviteLink"], review: ["termsAccepted", "authorityConfirmed"] };
  const stages = Object.entries(assignments).map(([key, names]) => {
    const stage = new Node({ dataset: { registrationStage: key }, disabled: key === "staff" }); stage.legend = new Node();
    stage.inputs = names.map(name => controls[name]).filter(Boolean); stage.inputs.forEach(input => { input.stage = stage; });
    stage.querySelector = () => stage.legend; stage.querySelectorAll = () => stage.inputs; return stage;
  });
  form.elements = { namedItem: key => controls[key] };
  form.querySelector = selector => selector === "[data-invite-token]" ? controls.inviteToken : selector === "[data-invite-link]" ? controls.inviteLink || null : nodes[selector.slice(6, -1)] || null;
  form.querySelectorAll = () => stages;
  form.requestSubmit = async () => { if (!(await form.dispatch("submit")).defaultPrevented) submitted++; };
  const paths = parent ? [] : [new Node({ dataset: { registrationPath: "new" } }), new Node({ dataset: { registrationPath: "staff" } })];
  const socialLinks = ["google", "kakao"].map(provider => new Node({ attrs: { href: `/auth/${provider}?accountType=${parent ? "parent" : "academy"}` } }));
  root.querySelector = selector => selector === "[data-portal-form]" ? form : nodes[selector.slice(6, -1)];
  root.querySelectorAll = selector => selector === "[data-registration-path]" ? paths : selector === "[data-social-provider]" ? socialLinks : [];
  const document = { readyState: "complete", querySelector: () => root, createElement: () => new Node() };
  const fetch = async () => ({ ok: true, json: async () => ({ token: "unit-invite-token", email: "fixture@qa.invalid", name: "<script>not executed</script>", expiresAt: new Date(Date.now() + 3600000).toISOString() }) });
  vm.runInNewContext(script, { document, TextEncoder, Intl, Date, URLSearchParams, SyntaxError, Error, fetch });
  return { nodes, controls, form, paths, socialLinks, stage: key => stages.find(item => item.dataset.registrationStage === key), submitted: () => submitted };
}

async function main() {
  for (const parent of [false, true]) {
    const social = fixture({ parent, social: true });
    assert.equal(social.controls.password, undefined);
    await social.nodes["registration-next"].dispatch("click");
    if (!parent) await social.nodes["registration-next"].dispatch("click");
    assert.equal(social.nodes["registration-submit"].hidden, false);
    assert.equal((await social.form.dispatch("submit")).defaultPrevented, false);
  }
  const academy = fixture();
  assert.equal(academy.stage("account").hidden, false); assert.equal(academy.stage("institution").hidden, true);
  academy.controls.displayName.value = ""; await academy.nodes["registration-next"].dispatch("click"); assert.equal(academy.stage("account").hidden, false); assert.equal(academy.controls.displayName.focused, true);
  academy.controls.displayName.value = "단위 테스트";
  await academy.nodes["registration-next"].dispatch("click"); assert.equal(academy.stage("institution").hidden, false);
  await academy.nodes["registration-back"].dispatch("click"); assert.equal(academy.controls.displayName.value, "단위 테스트");
  await academy.nodes["registration-next"].dispatch("click"); await academy.nodes["registration-next"].dispatch("click"); assert.equal(academy.stage("review").hidden, false); assert.equal(academy.nodes["registration-submit"].hidden, false);
  academy.controls.authorityConfirmed.checked = false; assert.equal((await academy.form.dispatch("submit")).defaultPrevented, true);
  academy.controls.authorityConfirmed.checked = true; assert.equal((await academy.form.dispatch("submit")).defaultPrevented, false);
  await academy.paths[1].dispatch("click"); assert.equal(academy.controls.registrationFlow.value, "staff"); assert.equal(academy.stage("institution").disabled, true); assert.equal(academy.controls.authorityConfirmed.disabled, true);
  assert.ok(academy.socialLinks.every(link => link.getAttribute("href").includes("path=staff")));
  await academy.nodes["registration-next"].dispatch("click"); await academy.nodes["registration-next"].dispatch("click"); assert.equal(academy.stage("staff").hidden, false); assert.match(academy.nodes["invite-error"].textContent, /초대 확인/);
  const parent = fixture({ parent: true }); await parent.nodes["registration-next"].dispatch("click"); assert.equal(parent.stage("child").hidden, false); assert.equal(parent.nodes["connect-later"].hidden, false);
  await parent.nodes["connect-later"].dispatch("click"); assert.equal(parent.submitted(), 1); assert.equal(parent.controls.inviteToken.value, "");
  parent.controls.inviteLink.value = "unit-child-link"; await parent.nodes["invite-lookup"].dispatch("click"); assert.equal(parent.controls.inviteToken.value, "unit-invite-token"); assert.equal(parent.nodes["invite-name"].textContent, "<script>not executed</script>");
  assert.ok(parent.socialLinks.every(link => link.getAttribute("href").includes("invite=unit-invite-token")));
  parent.controls.relationship.value = "MOTHER"; parent.controls.linkConsent.checked = true;
  parent.controls.inviteLink.value = "different-child-link"; await parent.controls.inviteLink.dispatch("input"); assert.equal(parent.controls.inviteToken.value, ""); assert.equal(parent.controls.relationship.value, ""); assert.equal(parent.controls.linkConsent.checked, false); assert.equal(parent.nodes["invite-preview"].hidden, true);
  const invitedParent = fixture({ parent: true, locked: true }); await invitedParent.nodes["registration-next"].dispatch("click");
  assert.equal(invitedParent.nodes["child-consent"].hidden, false); assert.equal(invitedParent.controls.relationship.required, true); assert.equal((await invitedParent.form.dispatch("submit")).defaultPrevented, true);
  invitedParent.controls.relationship.value = "MOTHER"; invitedParent.controls.linkConsent.checked = true; assert.equal((await invitedParent.form.dispatch("submit")).defaultPrevented, false);
  invitedParent.controls.email.value = "other@qa.invalid"; assert.equal((await invitedParent.form.dispatch("submit")).defaultPrevented, true); assert.match(invitedParent.nodes["invite-error"].textContent, /이메일/);
  console.log("Portal wizard unit DOM verified: next/back, preserved inputs, role path switching, approval/consent validation, required invitation matching and link-later submission.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
