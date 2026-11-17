"""Demucs CLI adapter for the official htdemucs checkpoint.

Recent PyTorch defaults to weights-only loading. The official checkpoint also
contains its model class, a Fraction, and NumPy scalar training metadata. Allow
these specific types instead of disabling the safer loader or patching Demucs.
"""
from contextlib import nullcontext
from fractions import Fraction
import os


def main():
    import numpy as np
    import torch
    from demucs.htdemucs import HTDemucs
    from demucs.separate import main as separate

    context = nullcontext()
    if hasattr(torch.serialization, "safe_globals"):
        os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"] = "1"
        context = torch.serialization.safe_globals([
            HTDemucs, Fraction, np.core.multiarray.scalar, np.dtype,
            type(np.dtype(np.float64)), type(np.dtype(np.float32)),
        ])
    # Intel Mac uses 2.2.2, before safe_globals was introduced; it retains its
    # original loader. All input / output / inference remain upstream Demucs.
    with context:
        separate()


if __name__ == "__main__":
    main()
