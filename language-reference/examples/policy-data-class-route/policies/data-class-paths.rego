# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# A house rule: data of one class does not reach a component of another class
# along a route of the build graph unless a declassifying Feature is attached on
# that route, at either end or anywhere between them.
#
# This rule is written once per engine this workspace attaches — this file for
# the Rego engine in the compiler, data-class-paths.cel for the CEL engine, and
# data-class-paths-opa.rego for OPA — and the three copies are a deliberate
# near-duplicate. Each is written on its own from the rule above, so a build on
# which the engines disagree shows the disagreement: the same build halting under
# one engine and completing under another is the signal. None is generated from
# another, and they are not to be merged into one shared implementation, which
# would make the engines agree by construction and hide the difference this
# exists to catch.
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

# The class a component carries, when it carries one.
class_of(id) := class if {
	labels := input.graph.spec.nodes[id].labels
	data.class_label in object.keys(labels)
	class := labels[data.class_label]
}

class_of(id) := class if {
	labels := input.graph.spec.nodes[id].labels
	not data.class_label in object.keys(labels)
	derived := [entry.class | some entry in data.classes_by_label; labels[entry.label] == entry.value]
	count(derived) > 0
	class := derived[0]
}

ranked(class) if class in object.keys(data.rank)

# A component carries a declassifying Feature when one of its attachments is of
# a type the declassifying_features setting lists, with or without a version.
declassifies(id) if {
	some attachment in input.graph.spec.feature_values_mapping[id]
	some listed in data.declassifying_features
	is_listed(attachment.type, listed)
}

is_listed(attached, listed) if attached == listed

is_listed(attached, listed) if startswith(attached, concat("", [listed, ":"]))

# Position j of a route is an offender when the component there carries a class
# ranked differently from the class of the route's first component, and no
# component from the first to it, both included, carries a declassifying Feature.
offender(route, j) if {
	j > 0
	start_class := class_of(route.nodes[0])
	reached_class := class_of(route.nodes[j])
	ranked(start_class)
	ranked(reached_class)
	data.rank[start_class] != data.rank[reached_class]
	not protected(route.nodes, j)
}

protected(nodes, j) if {
	some k, node in nodes
	k <= j
	declassifies(node)
}

# The first offender along a route is the one reported for it.
first_offender(route, j) if {
	offender(route, j)
	not earlier_offender(route, j)
}

earlier_offender(route, j) if {
	some k, _ in route.nodes
	k < j
	offender(route, k)
}

deny contains msg if {
	some route in input.precalculated_paths
	some j, _ in route.nodes
	first_offender(route, j)
	start := route.nodes[0]
	reached := route.nodes[j]
	msg := sprintf("%s (%s) reaches %s (%s) with no declassifying Feature attached between them", [start, class_of(start), reached, class_of(reached)])
}

# A class the rank setting does not list halts the build rather than reading as
# no class at all, so a misspelled class is reported instead of passing.
deny contains msg if {
	some id, _ in input.graph.spec.nodes
	class := class_of(id)
	not ranked(class)
	msg := sprintf("%s carries the data class \"%s\", which the policy's rank setting does not list; correct the class or rank it", [id, class])
}
