"""The pinned upstream's disabled compile calls on PyTorch 2.2 / Python 3.12.

PyTorch 2.2 rejects Python 3.12 before honoring compile(disable=True). All three
BandIt constructor calls explicitly disable compilation. Supply that no-op only
to those modules while constructing the model; never replace torch.compile or
modify installed source. Remove when Intel Mac can use a newer PyTorch wheel.
"""
from contextlib import contextmanager
import sys


class EagerTorch:
    def __init__(self, torch):
        self.torch = torch

    def __getattr__(self, name):
        return getattr(self.torch, name)

    def compile(self, model, *, disable=False, **kwargs):
        if disable is not True:
            raise RuntimeError("BandIt 兼容层只允许上游显式禁用的编译调用。")
        return model


@contextmanager
def eager_construction(torch):
    version = tuple(int(v) for v in torch.__version__.split("+")[0].split(".")[:2])
    if version >= (2, 3) or sys.version_info < (3, 12):
        yield
        return
    names = ("src.models.bandit.bandit", "src.models.bandit.bandsplit", "src.models.bandit.maskestim")
    modules = [sys.modules[name] for name in names]
    originals = [module.torch for module in modules]
    try:
        for module in modules:
            module.torch = EagerTorch(torch)
        yield
    finally:
        for module, original in zip(modules, originals):
            module.torch = original
