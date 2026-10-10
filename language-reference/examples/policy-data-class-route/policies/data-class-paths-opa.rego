# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# A house rule: data of one class does not reach a component of another class
# along a route of the build graph unless a declassifying Feature is attached on
# that route, at either end or anywhere between them.
#
# This rule is written once per engine this workspace attaches — this file for
# OPA, data-class-paths.rego for the Rego engine in the compiler, and
# data-class-paths.cel for the CEL engine — and the three copies are a deliberate
# near-duplicate. Each is written on its own from the rule above, so a build on
# which the engines disagree shows the disagreement: the same build halting under
# one engine and completing under another is the signal. None is generated from
# another, and they are not to be merged into one shared implementation, which
# would make the engines agree by construction and hide the difference this
# exists to catch. This file and data-class-paths.rego are written in the same
# language and are still two copies, for the same reason: each is the rule as one
# engine is given it.
#
# How OPA runs it. This file is compiled ahead of time with OPA's own toolchain,
# `opa build -t wasm`, into a WebAssembly module, and that module is baked into
# the adapter guest that sits beside this workspace's catalog/plugin/governance/
# opa/1.0.0/plugin.yaml. Editing this file changes no build until both are
# regenerated; this workspace's README gives the steps. The adapter provides none
# of the builtins OPA leaves to its host, so this copy uses only builtins OPA
# compiles into the module: its messages are joined with concat, where the Rego
# engine's copy formats them with sprintf. The attachment's settings arrive as
# the data document and the build graph as input, as they do for the other
# copies.
#
# What the rule reads, all of it from the build graph the compiler hands an
# ir-verdict attachment, and all of its meaning from this attachment's settings:
#
#   - The routes the compiler enumerates, input.precalculated_paths, each an
#     ordered list of components. The rule reads each route from its first
#     component; the compiler enumerates the routes leaving every component, so a
#     pair met partway along one route is also met at the start of another.
#   - Each component's class: the value of the label the class_label setting
#     names, or, for a component without that label, the class of the first
#     classes_by_label entry whose label and value the component carries. A
#     component with neither carries no class and the rule passes over it.
#   - Each component's attachments, input.graph.spec.feature_values_mapping. A
#     route's own attached_features list is not read: it names every Feature
#     attached anywhere on the route, so it cannot say whether one sits between
#     the two components in question.
#
# The compiler ranks nothing and reads no meaning into a class: the classes and
# their ranking are the rank setting's, so an estate states its own. The
# direction a route is drawn in is not read either, because a connection carries
# a request one way and its reply the other.
#
# The compiler bounds how many routes it lists from one component, and lists
# nothing past the bound, so on a graph with more routes than that a route can
# go unread.
package data_class_paths

import rego.v1

# A component's class: the value of its class_label label, or, for a component
# without that label, the class of the first classes_by_label entry it matches.
class_of(id) := own if {
	own := input.graph.spec.nodes[id].labels[data.class_label]
}

class_of(id) := derived if {
	labels := input.graph.spec.nodes[id].labels
	not labels[data.class_label]
	derived := [entry.class | some entry in data.classes_by_label; labels[entry.label] == entry.value][0]
}

# A component guards a route when one of its attachments is of a type the
# declassifying_features setting lists, with or without a version.
guards(id) if {
	some attachment in input.graph.spec.feature_values_mapping[id]
	some listed in data.declassifying_features
	names_feature(attachment.type, listed)
}

names_feature(attached, listed) if attached == listed

names_feature(attached, listed) if startswith(attached, concat("", [listed, ":"]))

# The position of the first component on a route that guards it. Defined only on
# a route something guards.
first_guard(nodes) := min(positions) if {
	positions := {k | some k, id in nodes; guards(id)}
	count(positions) > 0
}

# A position is unguarded when no component from the route's first to it, both
# included, guards the route.
unguarded(nodes, _) if not first_guard(nodes)

unguarded(nodes, j) if j < first_guard(nodes)

# The positions along a route whose component carries a class ranked
# differently from the class of the route's first component, with nothing
# guarding the route up to them.
offending_positions(nodes) := {j |
	some j, id in nodes
	j > 0
	unguarded(nodes, j)
	data.rank[class_of(nodes[0])] != data.rank[class_of(id)]
}

# The first such position along a route is the one reported for it.
deny contains message if {
	some route in input.precalculated_paths
	offenders := offending_positions(route.nodes)
	count(offenders) > 0
	start := route.nodes[0]
	reached := route.nodes[min(offenders)]
	message := concat("", [
		start, " (", class_of(start), ") reaches ",
		reached, " (", class_of(reached), ") with no declassifying Feature attached between them",
	])
}

# A class the rank setting does not list halts the build rather than reading as
# no class at all, so a misspelled class is reported instead of passing.
deny contains message if {
	some id, _ in input.graph.spec.nodes
	class := class_of(id)
	not class in object.keys(data.rank)
	message := concat("", [
		id, " carries the data class \"", class,
		"\", which the policy's rank setting does not list; correct the class or rank it",
	])
}
