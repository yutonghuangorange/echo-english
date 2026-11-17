"""The pinned upstream's disabled compile calls on PyTorch 2.2 / Python 3.12.

PyTorch 2.2 rejects Python 3.12 before honoring compile(disable=True). All three
BandIt constructor calls explicitly disable compilation. Supply that no-op only
to those modules while constructing the model; never replace torch.compile or
modify installed source. Remove when Intel Mac can use a newer PyTorch wheel.
"""
from contextlib import contextmanager
import sys
from types import ModuleType


class EagerTorch(ModuleType):
    def __init__(self, torch):
        super().__init__("torch")
        # Upstream also uses torch.__dict__[window_fn]. A module namespace copy
        # preserves that interface while leaving the original module untouched.
        self.__dict__.update(vars(torch))
        self.__dict__.pop("compile", None)

    def compile(self, model, *, disable=False, **kwargs):
        if disable is not True:
            raise RuntimeError("BandIt 兼容层只允许上游显式禁用的编译调用。")
        return model


def requires_eager_construction(torch):
    version = tuple(int(v) for v in torch.__version__.split("+")[0].split(".")[:2])
    return version < (2, 3) and sys.version_info >= (3, 12)


@contextmanager
def eager_construction(torch):
    if not requires_eager_construction(torch):
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
