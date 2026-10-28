# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# A house rule over the files a build writes, in two clauses:
#
#   - every container image names a fixed version: a tag other than latest, or a
#     digest. Read from each Docker Compose service, and from each container in a
#     Kubernetes workload's pod template;
#   - every RDS database instance stores its data encrypted. Read from each
#     aws_db_instance block of a Terraform file in native HCL, and from each
#     AWS::RDS::DBInstance resource of a CloudFormation template.
#
# Each clause reads the output shape of the targets that write it, and a file of
# any other shape is passed over.
#
# This rule is written twice — this file for the Rego engine, house-rule.cel for
# the CEL engine — and the two are a deliberate near-duplicate, each written on
# its own from the rule above. A build on which the two engines disagree shows
# the disagreement, so they are not to be generated one from the other.
package house

import rego.v1

# An image names no fixed version when it carries no digest and either ends in
# the tag latest or carries no tag at all: no ":" after its last "/".
unpinned(image) if {
    not contains(image, "@")
    endswith(image, ":latest")
}

unpinned(image) if {
    not contains(image, "@")
    not regex.match(`:[^/]+$`, image)
}

# The pod template of a Kubernetes workload: under spec.jobTemplate.spec for a
# CronJob, and under spec for the others.
pod_template(doc) := doc.spec.jobTemplate.spec.template if doc.kind == "CronJob"

pod_template(doc) := doc.spec.template if doc.kind != "CronJob"

deny contains msg if {
    some artifact in input.artifacts
    some doc in artifact.documents
    some name, service in doc.services
    unpinned(service.image)
    msg := sprintf("%v: service %v runs %v, an image with no tag or the tag latest", [artifact.path, name, service.image])
}

deny contains msg if {
    some artifact in input.artifacts
    some doc in artifact.documents
    some container in pod_template(doc).spec.containers
    unpinned(container.image)
    msg := sprintf("%v: container %v runs %v, an image with no tag or the tag latest", [artifact.path, container.name, container.image])
}

# A Terraform file in native HCL. Its format is hcl where the provider declared
# one; a file whose format is empty is told by its name, which is how the engine
# chose to parse it.
native_hcl(artifact) if artifact.format == "hcl"

native_hcl(artifact) if {
    artifact.format == ""
    endswith(artifact.path, ".tf")
}

# In a native .tf file each named block is a list of blocks, so the instance's
# attributes sit one index below its name.
deny contains msg if {
    some artifact in input.artifacts
    native_hcl(artifact)
    some doc in artifact.documents
    some name, blocks in doc.resource.aws_db_instance
    some block in blocks
    not block.storage_encrypted == true
    msg := sprintf("%v: the RDS instance %v stores its data unencrypted", [artifact.path, name])
}

deny contains msg if {
    some artifact in input.artifacts
    some doc in artifact.documents
    some id, resource in doc.Resources
    resource.Type == "AWS::RDS::DBInstance"
    not resource.Properties.StorageEncrypted == true
    msg := sprintf("%v: the RDS instance %v stores its data unencrypted", [artifact.path, id])
}
