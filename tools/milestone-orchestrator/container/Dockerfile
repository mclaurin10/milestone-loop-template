ARG BASE_IMAGE
FROM ${BASE_IMAGE}

ARG NODE_VERSION
ARG PNPM_VERSION
ARG IMAGE_INPUT_SHA256

ENV COREPACK_HOME=/opt/corepack

RUN mkdir -p "${COREPACK_HOME}" \
    && test "$(node --version)" = "v${NODE_VERSION}" \
    && git --version \
    && corepack enable \
    && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
    && test "$(pnpm --version)" = "${PNPM_VERSION}" \
    && chmod -R a=rX "${COREPACK_HOME}"

LABEL io.milestone-loop.image-contract="1.0.0" \
      io.milestone-loop.image-input-sha256="${IMAGE_INPUT_SHA256}" \
      io.milestone-loop.node-version="${NODE_VERSION}" \
      io.milestone-loop.pnpm-version="${PNPM_VERSION}"

USER 65532:65532
WORKDIR /workspace
